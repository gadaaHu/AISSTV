"""
MQTT consumer.

Runs paho's blocking client in a thread. Each message is processed via
asyncio.run_coroutine_threadsafe against the app's event loop.
"""
import asyncio
import json
import threading
from datetime import datetime, timezone
from typing import Any, Optional

import paho.mqtt.client as mqtt
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError

from .alerts import alert_manager
from .config import settings
from .db import SessionLocal
from .logging_conf import get_logger
from .models import Attendance, Camera, Employee, Event
from .services.incident_service import dispatch_incident_alerts, ingest_violence_event

log = get_logger(__name__)


# ------------------------------------------------------------------ stats
class ConsumerStats:
    def __init__(self) -> None:
        self.received = 0
        self.inserted = 0
        self.duplicates = 0
        self.invalid = 0
        self.errors = 0
        self.attendance_created = 0
        self.attendance_updated = 0
        self.unknown_employees = 0
        self.started_at = datetime.now(timezone.utc).timestamp()

    def snapshot(self) -> dict[str, int]:
        return {
            "uptime_sec": int(datetime.now(timezone.utc).timestamp() - self.started_at),
            "received": self.received,
            "inserted": self.inserted,
            "duplicates": self.duplicates,
            "invalid": self.invalid,
            "errors": self.errors,
            "attendance_created": self.attendance_created,
            "attendance_updated": self.attendance_updated,
            "unknown_employees": self.unknown_employees,
        }


STATS = ConsumerStats()


# ------------------------------------------------------------------ helpers
def _parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _is_valid(payload: dict) -> tuple[bool, Optional[str]]:
    for key in ("event_id", "ts", "camera_id", "type"):
        if not payload.get(key):
            return False, f"missing {key}"
    try:
        _parse_ts(payload["ts"])
    except Exception:
        return False, "bad ts"
    if not isinstance(payload.get("meta", {}), dict):
        return False, "meta not an object"
    return True, None


# ------------------------------------------------------------------ core
async def handle_event(payload: dict) -> None:
    STATS.received += 1

    ok, reason = _is_valid(payload)
    if not ok:
        STATS.invalid += 1
        log.warning("invalid_event", reason=reason, payload=payload)
        return

    async with SessionLocal() as db:
        try:
            # dedupe
            exists = await db.scalar(
                select(Event.id).where(Event.id == payload["event_id"])
            )
            if exists:
                STATS.duplicates += 1
                log.debug("duplicate_event", event_id=payload["event_id"])
                return

            # build row
            ev = Event(
                id=payload["event_id"],
                ts=_parse_ts(payload["ts"]),
                local_ts=_parse_ts(payload["local_ts"]) if payload.get("local_ts") else None,
                camera_id=payload["camera_id"],
                zone=payload.get("zone"),
                type=payload["type"],
                employee_code=payload.get("employee_id"),
                confidence=payload.get("confidence"),
                track_id=payload.get("track_id"),
                snapshot_path=payload.get("snapshot_path"),
                meta=payload.get("meta") or {},
            )

            # upsert camera
            await _upsert_camera(db, ev.camera_id, ev.zone, ev.type)

            # ensure employee FK (auto-stub)
            if ev.employee_code and ev.type in ("ENTER", "LATE", "EXIT", "RE_ENTER", "EMPLOYEE_ENTER"):
                await _ensure_employee_stub(db, ev.employee_code)

            db.add(ev)
            await db.flush()

            # derived
            if ev.type.startswith("EMPLOYEE_") or ev.type in ("ENTER", "LATE", "EXIT"):
                await _upsert_attendance(db, ev)

            pending_incidents = []
            if ev.type == "VIOLENCE_SUSPECT":
                incident = await ingest_violence_event(db, ev)
                pending_incidents.append(incident)

            await db.commit()
            STATS.inserted += 1
            log.info(
                "event_ingested",
                type=ev.type,
                employee=ev.employee_code,
                camera=ev.camera_id,
            )

            # alerts go out after commit
            for incident in pending_incidents:
                async with SessionLocal() as db2:
                    await dispatch_incident_alerts(db2, incident)
                    await db2.commit()

        except IntegrityError:
            await db.rollback()
            STATS.duplicates += 1
            log.info("integrity_duplicate", event_id=payload.get("event_id"))
        except Exception:
            await db.rollback()
            STATS.errors += 1
            log.exception("handle_event_failed", event_id=payload.get("event_id"))


async def _upsert_camera(db, camera_id: str, zone: Optional[str], evt_type: str) -> None:
    cam = await db.get(Camera, camera_id)
    if cam is None:
        cam = Camera(id=camera_id, zone=zone or "unknown", active=True)
        db.add(cam)
        log.info("camera_registered", camera_id=camera_id, zone=zone)
    cam.last_seen_at = datetime.now(timezone.utc)
    if evt_type == "EDGE_ONLINE":
        cam.last_state = "online"
    elif evt_type == "EDGE_OFFLINE":
        cam.last_state = "offline"
    elif evt_type == "EDGE_ERROR":
        cam.last_state = "error"
    elif evt_type == "EDGE_HEARTBEAT":
        cam.last_state = "online"
    if zone:
        cam.zone = zone


async def _ensure_employee_stub(db, code: str) -> None:
    exists = await db.scalar(select(Employee.code).where(Employee.code == code))
    if exists:
        return
    db.add(Employee(code=code, name=f"(auto) {code}", active=False))
    STATS.unknown_employees += 1
    log.warning("placeholder_employee_created", code=code)


async def _upsert_attendance(db, ev: Event) -> None:
    if not ev.employee_code or ev.type not in ("ENTER", "LATE", "EXIT"):
        return

    day = ev.ts.date()
    meta = ev.meta or {}

    att = await db.scalar(
        select(Attendance).where(
            Attendance.employee_code == ev.employee_code,
            Attendance.day == day,
        )
    )

    if att is None:
        att = Attendance(
            employee_code=ev.employee_code,
            day=day,
            status="present",
        )
        db.add(att)
        STATS.attendance_created += 1

    changed = False

    if ev.type in ("ENTER", "LATE"):
        if att.check_in is None or ev.ts < att.check_in:
            att.check_in = ev.ts
            att.first_event_id = ev.id
            changed = True
        if ev.type == "LATE":
            if att.status != "late":
                att.status = "late"
                changed = True
            ml = int(meta.get("minutes_late", 0))
            if ml > (att.minutes_late or 0):
                att.minutes_late = ml
                changed = True
    elif ev.type == "EXIT":
        if att.check_out is None or ev.ts > att.check_out:
            att.check_out = ev.ts
            changed = True
        dwell = int(meta.get("dwell_seconds", 0))
        if dwell > (att.dwell_seconds or 0):
            att.dwell_seconds = dwell
            changed = True

    if changed:
        att.last_event_id = ev.id
        STATS.attendance_updated += 1


# ------------------------------------------------------------------ mqtt glue
def _on_connect(client, userdata, flags, rc, props=None):
    if rc == 0:
        log.info("mqtt_connected", host=settings.mqtt_host, port=settings.mqtt_port)
        client.subscribe(settings.mqtt_topic, qos=settings.mqtt_qos)
        log.info("mqtt_subscribed", topic=settings.mqtt_topic)
    else:
        log.error("mqtt_connect_failed", rc=rc)


def _on_disconnect(client, userdata, rc, props=None):
    log.warning("mqtt_disconnected", rc=rc)


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        STATS.invalid += 1
        log.warning("mqtt_invalid_json", topic=msg.topic)
        return

    # Hand off to the main event loop
    loop: asyncio.AbstractEventLoop = userdata["loop"]
    asyncio.run_coroutine_threadsafe(handle_event(payload), loop)


# ------------------------------------------------------------------ lifecycle
_consumer_thread: threading.Thread | None = None


def start_consumer() -> mqtt.Client:
    """
    Start the consumer. Runs paho in a dedicated thread, but every
    message is processed on the main event loop (via asyncio.run_coroutine_threadsafe).
    """
    global _consumer_thread

    loop = asyncio.get_event_loop()

    client = mqtt.Client(
        client_id=settings.mqtt_client_id,
        clean_session=False,
        protocol=mqtt.MQTTv5,
        userdata={"loop": loop},
    )
    if settings.mqtt_username:
        client.username_pw_set(
            settings.mqtt_username,
            settings.mqtt_password.get_secret_value() if settings.mqtt_password else None,
        )
    if settings.mqtt_tls:
        if settings.mqtt_ca_cert:
            client.tls_set(ca_certs=settings.mqtt_ca_cert)
        else:
            client.tls_set()

    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message

    client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=60)

    _consumer_thread = threading.Thread(
        target=client.loop_forever, name="mqtt-consumer", daemon=True
    )
    _consumer_thread.start()
    log.info("consumer_started", client_id=settings.mqtt_client_id)
    return client


def stop_consumer(client: mqtt.Client) -> None:
    try:
        client.disconnect()
    except Exception:
        pass