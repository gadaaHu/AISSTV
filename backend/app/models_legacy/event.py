from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Index, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    local_ts: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    camera_id: Mapped[str] = mapped_column(String(64), index=True)
    zone: Mapped[Optional[str]] = mapped_column(String(100))
    type: Mapped[str] = mapped_column(String(32), index=True)
    employee_code: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    confidence: Mapped[Optional[float]] = mapped_column(Float)
    track_id: Mapped[Optional[int]] = mapped_column(Integer)
    snapshot_path: Mapped[Optional[str]] = mapped_column(String(500))
    meta: Mapped[dict] = mapped_column(JSONB, default=dict)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        Index("ix_events_emp_ts", "employee_code", "ts"),
        Index("ix_events_cam_ts", "camera_id", "ts"),
    )
