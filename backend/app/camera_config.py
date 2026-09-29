from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean, DateTime, Float, String, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class CameraConfig(Base):
    __tablename__ = "camera_configs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    zone: Mapped[str] = mapped_column(String(100))
    site: Mapped[Optional[str]] = mapped_column(String(100))

    url: Mapped[str] = mapped_column(String(500))
    rtsp_transport: Mapped[str] = mapped_column(String(10), default="tcp")
    username: Mapped[Optional[str]] = mapped_column(String(100))
    password: Mapped[Optional[str]] = mapped_column(String(200))

    enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    fps_process: Mapped[float] = mapped_column(Float, default=3.0)
    detection_confidence: Mapped[float] = mapped_column(Float, default=0.45)
    face_threshold: Mapped[float] = mapped_column(Float, default=0.45)
    save_snapshots: Mapped[bool] = mapped_column(Boolean, default=False)

    tags: Mapped[list] = mapped_column(JSONB, default=list)
    notes: Mapped[Optional[str]] = mapped_column(String(500))

    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    last_state: Mapped[Optional[str]] = mapped_column(String(20))
    last_error: Mapped[Optional[str]] = mapped_column(String(500))
    edge_node: Mapped[Optional[str]] = mapped_column(String(64))
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
