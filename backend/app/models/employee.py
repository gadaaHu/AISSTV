import uuid
from datetime import datetime, time
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, Time, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

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
    attendance: Mapped[list["Attendance"]] = relationship("Attendance", back_populates="employee", cascade="all, delete-orphan")
