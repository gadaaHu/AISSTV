import asyncio
import json
import threading
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from .config import settings
from .db import SessionLocal
from .logging_conf import get_logger
from .models import Attendance, Camera, Employee, Event

log = get_logger(__name__)


class ConsumerStats:
    def __init__(self):
        self.received = 0
        self.inserted = 0
        self.duplicates = 0
        self.invalid = 0
        self.errors = 0
        self.attendance_created = 0
        self.attendance_updated = 0
        self.unknown_employees = 0
        self.started_at = datetime.now(timezone.utc).timestamp()

    def snapshot(self) -> dict:
        return {
            "uptime_sec": int(datetime.now(timezone.utc).timestamp() - self.started_at),
            "received": self.received, "inserted": self.inserted,
            "duplicates": self.duplicates, "invalid": self.invalid,
            "errors": self.errors,
            "attendance_created": self.attendance_created,
            "attendance_updated": self.attendance_updated,
            "unknown_employees": self.unknown_employees,
        }


STATS = ConsumerStats()


def _parse_ts(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _is_valid(payload: dict):
    for key in ("event_id", "ts", "camera_id", "type"):
        if not payload.get(key):
            return False, f"missing {key}"
    return True, None


async def handle_event(payload: dict) -> None:
    STATS.received += 1
    ok, reason = _is_valid(payload)
    if not ok:
        STATS.invalid += 1
        log.warning("invalid_event", reason=reason)
        return

    async with SessionLocal() as db:
        try:
            exists = await db.scalar(select(Event.id).where(Event.id == payload["event_id"]))
            if exists:
                STATS.duplicates += 1
                return

            ev = Event(
                id=payload["event_id"],
                ts=_parse_ts(payload["ts"]),
                camera_id=payload["camera_id"],
                zone=payload.get("zone"),
                type=payload["type"],
                employee_code=payload.get("employee_id"),
                confidence=payload.get("confidence"),
                track_id=payload.get("track_id"),
                meta=payload.get("meta") or {},
            )

            cam = await db.get(Camera, ev.camera_id)
            if cam is None:
                cam = Camera(id=ev.camera_id, zone=ev.zone or "unknown", active=True)
                db.add(cam)
            cam.last_seen_at = datetime.now(timezone.utc)

            if ev.employee_code:
                emp_exists = await db.scalar(select(Employee.code).where(Employee.code == ev.employee_code))
                if not emp_exists:
                    db.add(Employee(code=ev.employee_code, name=f"(auto) {ev.employee_code}", active=False))
                    STATS.unknown_employees += 1

            db.add(ev)
            await db.flush()

            if ev.type in ("ENTER", "LATE", "EXIT") and ev.employee_code:
                await _upsert_attendance(db, ev)

            await db.commit()
            STATS.inserted += 1
            log.info("event_ingested", type=ev.type, employee=ev.employee_code, camera=ev.camera_id)

        except IntegrityError:
            await db.rollback()
            STATS.duplicates += 1
        except Exception:
            await db.rollback()
            STATS.errors += 1
            log.exception("handle_event_failed")


async def _upsert_attendance(db, ev: Event) -> None:
    if not ev.employee_code:
        return
    day = ev.ts.date()
    meta = ev.meta or {}

    att = await db.scalar(
        select(Attendance).where(Attendance.employee_code == ev.employee_code,
                                  Attendance.day == day))
    if att is None:
        att = Attendance(employee_code=ev.employee_code, day=day, status="present")
        db.add(att)
        STATS.attendance_created += 1

    if ev.type in ("ENTER", "LATE"):
        if att.check_in is None or ev.ts < att.check_in:
            att.check_in = ev.ts
        if ev.type == "LATE":
            att.status = "late"
            ml = int(meta.get("minutes_late", 0))
            if ml > (att.minutes_late or 0):
                att.minutes_late = ml
    elif ev.type == "EXIT":
        if att.check_out is None or ev.ts > att.check_out:
            att.check_out = ev.ts
        dwell = int(meta.get("dwell_seconds", 0))
        if dwell > (att.dwell_seconds or 0):
            att.dwell_seconds = dwell


def _on_connect(client, userdata, flags, rc, props=None):
    if rc == 0:
        log.info("mqtt_connected")
        client.subscribe(settings.mqtt_topic, qos=settings.mqtt_qos)


def _on_disconnect(client, userdata, rc, props=None):
    log.warning("mqtt_disconnected", rc=rc)


def _on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except Exception:
        STATS.invalid += 1
        return
    loop = userdata["loop"]
    asyncio.run_coroutine_threadsafe(handle_event(payload), loop)


_consumer_thread = None


def start_consumer():
    global _consumer_thread
    loop = asyncio.get_event_loop()
    client = mqtt.Client(
        client_id=settings.mqtt_client_id,
        protocol=mqtt.MQTTv5,
        userdata={"loop": loop},
    )
    client.on_connect = _on_connect
    client.on_disconnect = _on_disconnect
    client.on_message = _on_message
    client.connect_async(settings.mqtt_host, settings.mqtt_port, keepalive=60)

    _consumer_thread = threading.Thread(target=client.loop_forever, name="mqtt-consumer", daemon=True)
    _consumer_thread.start()
    log.info("consumer_started")
    return client


def stop_consumer(client) -> None:
    try:
        client.disconnect()
    except Exception:
        pass
