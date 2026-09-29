import uuid
from datetime import date, datetime, time
from typing import Optional

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey,
    Index, Integer, String, Text, Time, UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Employee(Base):
    __tablename__ = "employees"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[Optional[str]] = mapped_column(String(200))
    department: Mapped[Optional[str]] = mapped_column(String(100))
    title: Mapped[Optional[str]] = mapped_column(String(100))
    shift_start: Mapped[time] = mapped_column(Time, default=time(9, 0))
    shift_end: Mapped[time] = mapped_column(Time, default=time(18, 0))
    timezone: Mapped[str] = mapped_column(String(64), default="Africa/Addis_Ababa")
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    consent_signed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    consent_version: Mapped[Optional[str]] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    attendance: Mapped[list] = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
    leave_requests: Mapped[list] = relationship("LeaveRequest", back_populates="employee", cascade="all, delete-orphan")
    work_schedules: Mapped[list] = relationship("WorkSchedule", back_populates="employee", cascade="all, delete-orphan")


class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    zone: Mapped[str] = mapped_column(String(100))
    site: Mapped[Optional[str]] = mapped_column(String(100))

    url: Mapped[str] = mapped_column(String(500), default="")
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


class Attendance(Base):
    __tablename__ = "attendance"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_code: Mapped[str] = mapped_column(String(64), ForeignKey("employees.code", ondelete="RESTRICT"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    check_in: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    check_out: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="present", index=True)
    minutes_late: Mapped[int] = mapped_column(Integer, default=0)
    dwell_seconds: Mapped[int] = mapped_column(Integer, default=0)
    first_event_id: Mapped[Optional[str]] = mapped_column(String(36))
    last_event_id: Mapped[Optional[str]] = mapped_column(String(36))
    expected_status: Mapped[Optional[str]] = mapped_column(String(30))
    expected_leave_type: Mapped[Optional[str]] = mapped_column(String(30))
    has_exception: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    employee: Mapped[Employee] = relationship("Employee", back_populates="attendance")
    __table_args__ = (
        UniqueConstraint("employee_code", "day", name="uq_attendance_emp_day"),
        Index("ix_attendance_day_status", "day", "status"),
    )


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), default="viewer")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Holiday(Base):
    """Company-wide or site-specific public holidays."""
    __tablename__ = "holidays"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    day: Mapped[date] = mapped_column(Date, index=True)
    name: Mapped[str] = mapped_column(String(200))
    site: Mapped[Optional[str]] = mapped_column(String(100), index=True)  # None = all sites
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (
        UniqueConstraint("day", "site", name="uq_holiday_day_site"),
    )


class LeaveRequest(Base):
    """Employee leave requests (annual, sick, unpaid, etc.)."""
    __tablename__ = "leave_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_code: Mapped[str] = mapped_column(
        String(64), ForeignKey("employees.code", ondelete="CASCADE"), index=True
    )
    leave_type: Mapped[str] = mapped_column(String(50))          # annual | sick | unpaid | other
    start_date: Mapped[date] = mapped_column(Date, index=True)
    end_date: Mapped[date] = mapped_column(Date)
    reason: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending|approved|rejected
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(64))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    employee: Mapped["Employee"] = relationship("Employee", back_populates="leave_requests")
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_leave_dates"),
        Index("ix_leave_emp_dates", "employee_code", "start_date", "end_date"),
    )


class WorkSchedule(Base):
    """Per-employee weekly schedule overrides (e.g., shifts, part-time)."""
    __tablename__ = "work_schedules"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    employee_code: Mapped[str] = mapped_column(
        String(64), ForeignKey("employees.code", ondelete="CASCADE"), index=True
    )
    weekday: Mapped[int] = mapped_column(Integer)  # 0=Mon … 6=Sun
    is_working: Mapped[bool] = mapped_column(Boolean, default=True)
    shift_start: Mapped[Optional[time]] = mapped_column(Time)
    shift_end: Mapped[Optional[time]] = mapped_column(Time)
    effective_from: Mapped[date] = mapped_column(Date, default=date.today)
    effective_to: Mapped[Optional[date]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    employee: Mapped["Employee"] = relationship("Employee", back_populates="work_schedules")
    __table_args__ = (
        UniqueConstraint("employee_code", "weekday", name="uq_schedule_emp_day"),
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_weekday"),
    )


class Incident(Base):
    """Safety / fraud / panic incidents raised by the edge or manually."""
    __tablename__ = "incidents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    type: Mapped[str] = mapped_column(String(40), index=True)        # FRAUD|SAFETY|PANIC|UNKNOWN
    severity: Mapped[str] = mapped_column(String(20), default="medium", index=True)  # low|medium|high|critical
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)      # open|investigating|resolved|dismissed
    camera_id: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    employee_code: Mapped[Optional[str]] = mapped_column(String(64), index=True)
    zone: Mapped[Optional[str]] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    evidence: Mapped[dict] = mapped_column(JSONB, default=dict)      # snapshot paths, event IDs, etc.
    resolved_by: Mapped[Optional[str]] = mapped_column(String(64))
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    resolution_note: Mapped[Optional[str]] = mapped_column(Text)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    __table_args__ = (
        Index("ix_incident_type_status", "type", "status"),
    )
