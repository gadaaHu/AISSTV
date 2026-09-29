import uuid
from datetime import date, datetime
from typing import Optional, TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

if TYPE_CHECKING:
    from .employee import Employee

def _uuid() -> str:
    return str(uuid.uuid4())

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
    employee: Mapped["Employee"] = relationship("Employee", back_populates="attendance")
    __table_args__ = (
        UniqueConstraint("employee_code", "day", name="uq_attendance_emp_day"),
        Index("ix_attendance_day_status", "day", "status"),
    )
