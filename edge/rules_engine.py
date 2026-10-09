import uuid
import sqlite3
import logging
from dataclasses import dataclass, field
from datetime import datetime, time, timedelta, timezone
from typing import Optional

log = logging.getLogger(__name__)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ------------------------------------------------------------------ state
@dataclass
class PersonState:
    """Per-track state. One of these exists for every person currently on screen."""
    track_id: int
    employee_id: Optional[str] = None
    unknown_id: Optional[str] = None
    confidence: float = 0.0
    first_seen: datetime = field(default_factory=_now)
    last_seen: datetime = field(default_factory=_now)
    last_identity_ts: datetime = field(default_factory=_now)
    frames_seen: int = 0
    frames_with_identity: int = 0
    enter_emitted: bool = False
    exit_emitted: bool = False
    # we keep a copy of the best snapshot timestamp for evidence
    best_confidence: float = 0.0


# ------------------------------------------------------------------ engine
class RulesEngine:
    """
    Turns per-frame identity observations into attendance events.

    Public API:
        update(track_id, employee_id, confidence) -> list[dict]
        sweep()                                   -> list[dict]
        snapshot_state()                          -> list[dict]
        reset_day()                               -> list[dict]   (internal, called by update on rollover)
    """

    def __init__(
        self,
        camera_id: str,
        zone: str,
        shift_start: str = "09:00",
        grace_minutes: int = 15,
        exit_timeout_sec: int = 20,
        min_frames_for_enter: int = 3,
        min_confidence_for_enter: float = 0.45,
        unknown_alert_sec: int = 5,
        timezone_name: str = "Africa/Addis_Ababa",
        debounce_hours: float = 16.0,
        db_path: Optional[str] = None,
    ):
        self.camera_id = camera_id
        self.zone = zone

        h, m = map(int, shift_start.split(":"))
        self.shift_start = time(h, m)
        self.grace = timedelta(minutes=grace_minutes)

        self.exit_timeout = timedelta(seconds=exit_timeout_sec)
        self.min_frames_for_enter = min_frames_for_enter
        self.min_confidence_for_enter = min_confidence_for_enter
        self.unknown_alert_sec = unknown_alert_sec

        # 16-hour cooldown window for face deduplication
        self.debounce_hours = debounce_hours
        self.debounce_delta = timedelta(hours=debounce_hours)
        self.db_path = db_path
        # face_key (employee_id or unknown_id) -> datetime when first counted
        self._counted_faces: dict[str, datetime] = {}
        self._init_cooldown_db()

        # timezone for local business rules (late, day rollover)
        try:
            from zoneinfo import ZoneInfo
            self.tz = ZoneInfo(timezone_name)
        except Exception:
            self.tz = timezone.utc

        # track_id -> PersonState
        self.states: dict[int, PersonState] = {}

        # unknown-person tracking (opt: emit UNKNOWN alert once per track)
        self._unknown_alerted: set[int] = set()

        # bookkeeping for day rollover
        self._day = self._local_now().date()

        log.info(
            "RulesEngine ready (cam=%s zone=%s shift=%s grace=%dm tz=%s cooldown=%.1fh)",
            camera_id, zone, shift_start, grace_minutes, self.tz, debounce_hours,
        )

    # ------------------------------------------------------------------ helpers
    def _local_now(self) -> datetime:
        return _now().astimezone(self.tz)

    def _init_cooldown_db(self):
        """Initialize SQLite database for 16-hour cooldown persistence across restarts."""
        if not self.db_path:
            return
        try:
            with sqlite3.connect(self.db_path) as con:
                con.execute("""
                    CREATE TABLE IF NOT EXISTS counted_faces (
                        face_id TEXT PRIMARY KEY,
                        counted_at REAL NOT NULL,
                        face_type TEXT NOT NULL
                    )
                """)
                con.execute("CREATE INDEX IF NOT EXISTS ix_counted_at ON counted_faces(counted_at)")
                cutoff = (_now() - self.debounce_delta).timestamp()
                rows = con.execute(
                    "SELECT face_id, counted_at FROM counted_faces WHERE counted_at >= ?", (cutoff,)
                ).fetchall()
                for fid, ts in rows:
                    self._counted_faces[fid] = datetime.fromtimestamp(ts, tz=timezone.utc)
                log.info("Loaded %d active face cooldown(s) from %s", len(self._counted_faces), self.db_path)
        except Exception:
            log.exception("Failed to initialize cooldown db %s", self.db_path)

    def _get_last_counted(self, face_id: str, now: datetime) -> Optional[datetime]:
        """Return the timestamp if this face was counted within the debounce window, else None."""
        cutoff = now - self.debounce_delta
        # Prune expired entries in memory
        expired = [k for k, v in self._counted_faces.items() if v < cutoff]
        for k in expired:
            del self._counted_faces[k]
        if self.db_path and expired:
            try:
                with sqlite3.connect(self.db_path) as con:
                    con.execute("DELETE FROM counted_faces WHERE counted_at < ?", (cutoff.timestamp(),))
            except Exception:
                pass
        return self._counted_faces.get(face_id)

    def _record_count(self, face_id: str, now: datetime, face_type: str = "recognized"):
        """Record that a face has been counted at this timestamp."""
        self._counted_faces[face_id] = now
        if self.db_path:
            try:
                with sqlite3.connect(self.db_path) as con:
                    con.execute(
                        "INSERT OR REPLACE INTO counted_faces (face_id, counted_at, face_type) VALUES (?, ?, ?)",
                        (face_id, now.timestamp(), face_type),
                    )
            except Exception:
                log.exception("Failed to persist counted face %s", face_id)

    def _event(self, etype: str, st: Optional[PersonState], **extra) -> dict:
        """Build the standard event payload sent to MQTT."""
        return {
            "event_id": str(uuid.uuid4()),
            "ts": _now().isoformat(),
            "local_ts": self._local_now().isoformat(),
            "camera_id": self.camera_id,
            "zone": self.zone,
            "type": etype,
            "employee_id": st.employee_id if st else None,
            "confidence": round(st.confidence, 3) if st else 0.0,
            "track_id": st.track_id if st else None,
            "meta": extra,
        }

    def _maybe_rollover(self) -> list[dict]:
        """If the local day changed, clear transient per-day state and emit DAY_ROLLOVER."""
        today = self._local_now().date()
        if today == self._day:
            return []
        log.info("Day rollover: %s -> %s", self._day, today)
        evt = self._event(
            "DAY_ROLLOVER", None,
            previous_day=str(self._day), new_day=str(today),
        )
        self._day = today
        self._unknown_alerted.clear()
        # NOTE: self._counted_faces is NOT cleared on midnight rollover!
        # The 16-hour cooldown rule strictly governs across midnight.
        return [evt]

    # ------------------------------------------------------------------ update
    def update(
        self,
        track_id: int,
        employee_id: Optional[str] = None,
        confidence: float = 0.0,
        unknown_id: Optional[str] = None,
    ) -> list[dict]:
        """
        Called every processed frame for every active track.
        Returns the list of events generated by THIS frame (usually empty).
        """
        events: list[dict] = []
        events.extend(self._maybe_rollover())

        now = _now()
        st = self.states.get(track_id)

        # --- new track ---
        if st is None:
            st = PersonState(track_id=track_id)
            self.states[track_id] = st

        st.last_seen = now
        st.frames_seen += 1
        if unknown_id and not st.unknown_id:
            st.unknown_id = unknown_id

        # --- identity observation ---
        if employee_id is not None and confidence >= self.min_confidence_for_enter:
            st.frames_with_identity += 1
            # keep the highest-confidence observation as the "official" ID
            if confidence > st.best_confidence:
                st.employee_id = employee_id
                st.confidence = confidence
                st.best_confidence = confidence
                st.last_identity_ts = now

        # --- ENTER decision (recognized employee) ---
        # requires: have an ID, seen enough frames
        if (
            st.employee_id
            and not st.enter_emitted
            and st.frames_with_identity >= self.min_frames_for_enter
        ):
            st.enter_emitted = True
            last_counted = self._get_last_counted(st.employee_id, now)

            if last_counted is None:
                # Count employee face! Starts 16-hour suppression.
                self._record_count(st.employee_id, now, "recognized")
                events.append(self._event("ENTER", st))

                # --- LATE decision ---
                local = self._local_now()
                shift_dt = datetime.combine(local.date(), self.shift_start, tzinfo=self.tz)
                if local > shift_dt + self.grace:
                    minutes_late = int((local - shift_dt).total_seconds() // 60)
                    events.append(self._event("LATE", st, minutes_late=minutes_late))
            else:
                # Already counted within the last 16 hours -> do NOT count again!
                events.append(self._event(
                    "RE_ENTER", st,
                    suppressed_within_16h=True,
                    last_counted=last_counted.isoformat(),
                ))

        # --- UNKNOWN alert (unknown face) ---
        if (
            st.employee_id is None
            and not st.enter_emitted
            and (now - st.first_seen).total_seconds() > self.unknown_alert_sec
            and track_id not in self._unknown_alerted
        ):
            self._unknown_alerted.add(track_id)
            unknown_key = st.unknown_id or f"unknown_track_{track_id}"
            last_counted = self._get_last_counted(unknown_key, now)

            if last_counted is None:
                # First time seeing this unknown face in 16 hours -> count and emit UNKNOWN
                self._record_count(unknown_key, now, "unknown")
                events.append(self._event(
                    "UNKNOWN", st,
                    unknown_id=st.unknown_id,
                    dwell_so_far=int((now - st.first_seen).total_seconds()),
                ))
            else:
                # Already counted within the last 16 hours -> do NOT count again!
                log.info(
                    "Suppressed UNKNOWN face count for %s (already counted within %sh window at %s)",
                    unknown_key, self.debounce_hours, last_counted.isoformat(),
                )

        return events

    # ------------------------------------------------------------------ sweep
    def sweep(self) -> list[dict]:
        """
        Called on a timer (e.g. 1 Hz). Emits EXIT for tracks that have
        disappeared, and cleans up.
        """
        events: list[dict] = []
        now = _now()

        for tid, st in list(self.states.items()):
            age = (now - st.last_seen).total_seconds()

            # --- EXIT ---
            if age > self.exit_timeout.total_seconds():
                if st.employee_id and st.enter_emitted and not st.exit_emitted:
                    st.exit_emitted = True
                    dwell = int((st.last_seen - st.first_seen).total_seconds())
                    events.append(self._event("EXIT", st, dwell_seconds=dwell))
                # remove state — a future sighting will be a fresh track
                del self.states[tid]
                self._unknown_alerted.discard(tid)

        return events

    # ------------------------------------------------------------------ introspection
    def snapshot_state(self) -> list[dict]:
        """For debugging / dashboards: who is currently on screen."""
        now = _now()
        out = []
        for st in self.states.values():
            out.append({
                "track_id": st.track_id,
                "employee_id": st.employee_id,
                "confidence": round(st.confidence, 3),
                "age_sec": round((now - st.first_seen).total_seconds(), 1),
                "since_last_seen_sec": round((now - st.last_seen).total_seconds(), 1),
                "frames_seen": st.frames_seen,
                "frames_with_identity": st.frames_with_identity,
                "enter_emitted": st.enter_emitted,
            })
        return out