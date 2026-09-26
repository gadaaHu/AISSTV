import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


def _uuid() -> str:
    return str(uuid.uuid4())


class CameraDevice(Base):
    __tablename__ = "camera_devices"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    vendor: Mapped[Optional[str]] = mapped_column(String(64))
    model: Mapped[Optional[str]] = mapped_column(String(128))
    firmware: Mapped[Optional[str]] = mapped_column(String(64))
    ip: Mapped[str] = mapped_column(String(45), index=True)
    onvif_port: Mapped[int] = mapped_column(Integer, default=80)
    rtsp_port: Mapped[int] = mapped_column(Integer, default=554)
    username: Mapped[Optional[str]] = mapped_column(String(64))
    password: Mapped[Optional[str]] = mapped_column(String(128))
    main_path: Mapped[str] = mapped_column(String(255), default="/Streaming/Channels/101")
    sub_path: Mapped[str] = mapped_column(String(255), default="/Streaming/Channels/102")
    zone: Mapped[Optional[str]] = mapped_column(String(100))
    site: Mapped[Optional[str]] = mapped_column(String(100))
    has_ptz: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    capabilities: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StreamSession(Base):
    __tablename__ = "stream_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    camera_id: Mapped[str] = mapped_column(String(64), ForeignKey("camera_devices.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # hls | webrtc | rtsp-proxy
    url: Mapped[str] = mapped_column(String(500))
    started_by: Mapped[Optional[str]] = mapped_column(String(64))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


class PtzPreset(Base):
    __tablename__ = "ptz_presets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    camera_id: Mapped[str] = mapped_column(String(64), ForeignKey("camera_devices.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    onvif_preset_token: Mapped[Optional[str]] = mapped_column(String(64))
    pan: Mapped[Optional[float]] = mapped_column(Float)
    tilt: Mapped[Optional[float]] = mapped_column(Float)
    zoom: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Recording(Base):
    __tablename__ = "recordings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    camera_id: Mapped[str] = mapped_column(String(64), ForeignKey("camera_devices.id"), index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_sec: Mapped[Optional[int]] = mapped_column(Integer)
    file_path: Mapped[str] = mapped_column(String(500))
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer)
    trigger: Mapped[str] = mapped_column(String(20), default="manual")  # manual | motion | scheduled
    status: Mapped[str] = mapped_column(String(20), default="recording")
    created_by: Mapped[Optional[str]] = mapped_column(String(64))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CameraEvent(Base):
    __tablename__ = "camera_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    camera_id: Mapped[str] = mapped_column(String(64), ForeignKey("camera_devices.id"), index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, server_default=func.now())
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)