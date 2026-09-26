"""Safety incident creation and dispatch."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..alerts import alert_manager
from ..logging_conf import get_logger
from ..models import (
    AlertDelivery, Event, Incident, IncidentTier,
)

log = get_logger(__name__)

AGGREGATION_WINDOW_SEC = 30


async def _find_open_incident(
    db: AsyncSession, camera_id: str, ts: datetime
) -> Incident | None:
    cutoff = ts - timedelta(seconds=AGGREGATION_WINDOW_SEC)
    return await db.scalar(
        select(Incident)
        .where(
            Incident.camera_id == camera_id,
            Incident.status.in_(("open", "acknowledged", "responding", "escalated")),
            Incident.detected_at >= cutoff,
        )
        .order_by(Incident.detected_at.desc())
    )


async def ingest_violence_event(db: AsyncSession, ev: Event) -> Incident:
    meta = ev.meta or {}
    signal = meta.get("signal", "unknown")
    tier = int(meta.get("tier", 2))

    incident = await _find_open_incident(db, ev.camera_id, ev.ts)

    if incident is None:
        incident = Incident(
            tier=tier,
            camera_id=ev.camera_id,
            zone=ev.zone,
            detected_at=ev.ts,
            signal_types=[signal],
            confidence=float(meta.get("max_score", 0.0)),
            subject_count=len(meta.get("tracks", []))
            if isinstance(meta.get("tracks"), list)
            else 0,
            status="open",
        )
        db.add(incident)
        await db.flush()
        log.warning("incident_new", tier=tier, signal=signal, camera=ev.camera_id)
    else:
        signals = list(incident.signal_types or [])
        if signal not in signals:
            signals.append(signal)
        incident.signal_types = signals
        incident.confidence = max(incident.confidence or 0.0,
                                  float(meta.get("max_score", 0.0)))
        if tier > incident.tier:
            log.warning(
                "incident_escalated",
                incident_id=incident.id,
                from_tier=incident.tier,
                to_tier=tier,
            )
            incident.tier = tier
            incident.status = "escalated"

    # attach evidence
    ev_store = dict(incident.evidence or {})
    ev_store.setdefault("event_ids", []).append(ev.id)
    ev_store.setdefault("signals_detail", []).append(meta)
    incident.evidence = ev_store

    return incident


async def dispatch_incident_alerts(db: AsyncSession, incident: Incident) -> None:
    tier_cfg = await db.get(IncidentTier, incident.tier)
    if tier_cfg is None:
        log.error("no_tier_config", tier=incident.tier)
        return

    channels = tier_cfg.notify_channels or ["sse"]
    roles = tier_cfg.notify_roles or ["security"]

    payload = {
        "kind": "safety_incident",
        "incident_id": incident.id,
        "tier": incident.tier,
        "tier_name": tier_cfg.name,
        "camera_id": incident.camera_id,
        "zone": incident.zone,
        "detected_at": incident.detected_at.isoformat(),
        "signals": incident.signal_types,
        "confidence": incident.confidence,
        "status": incident.status,
        "ack_timeout_sec": tier_cfg.ack_timeout_sec,
    }

    if "sse" in channels:
        await alert_manager.broadcast(payload)

    if "mqtt" in channels:
        alert_manager.publish_mqtt(payload, topic="attendance/alerts/safety")

    for role in roles:
        for channel in channels:
            db.add(AlertDelivery(
                channel=channel,
                recipient=role,
                payload=payload,
                status="sent",
            ))