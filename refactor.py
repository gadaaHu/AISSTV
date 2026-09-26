import os

def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)

# Ensure directories
models_dir = 'backend/app/models'
schemas_dir = 'backend/app/schemas'
ensure_dir(models_dir)
ensure_dir(schemas_dir)

# --- MODELS ---

models_init = '''from .employee import Employee
from .camera import Camera
from .event import Event
from .attendance import Attendance
from .user import User

__all__ = ["Employee", "Camera", "Event", "Attendance", "User"]
'''
with open(f'{models_dir}/__init__.py', 'w') as f: f.write(models_init)

employee_model = '''import uuid
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
'''
with open(f'{models_dir}/employee.py', 'w') as f: f.write(employee_model)

camera_model = '''from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    zone: Mapped[str] = mapped_column(String(100))
    site: Mapped[Optional[str]] = mapped_column(String(100))
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    last_state: Mapped[Optional[str]] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
'''
with open(f'{models_dir}/camera.py', 'w') as f: f.write(camera_model)

event_model = '''from datetime import datetime
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
'''
with open(f'{models_dir}/event.py', 'w') as f: f.write(event_model)

attendance_model = '''import uuid
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
'''
with open(f'{models_dir}/attendance.py', 'w') as f: f.write(attendance_model)

user_model = '''import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

def _uuid() -> str:
    return str(uuid.uuid4())

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
'''
with open(f'{models_dir}/user.py', 'w') as f: f.write(user_model)


# --- SCHEMAS ---

schemas_init = '''from .common import Page, TokenOut, ChangePasswordIn, ConsumerStats
from .user import UserOut
from .employee import EmployeeIn, EmployeeUpdate, EmployeeOut
from .attendance import AttendanceRow, AttendanceSummary, AttendanceOut
from .event import EventOut
from .camera import CameraOut

__all__ = [
    "Page", "TokenOut", "ChangePasswordIn", "ConsumerStats",
    "UserOut",
    "EmployeeIn", "EmployeeUpdate", "EmployeeOut",
    "AttendanceRow", "AttendanceSummary", "AttendanceOut",
    "EventOut",
    "CameraOut"
]
'''
with open(f'{schemas_dir}/__init__.py', 'w') as f: f.write(schemas_init)

common_schema = '''from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str

class ConsumerStats(BaseModel):
    uptime_sec: int
    received: int
    inserted: int
    duplicates: int
    invalid: int
    errors: int
    attendance_created: int
    attendance_updated: int
    unknown_employees: int
'''
with open(f'{schemas_dir}/common.py', 'w') as f: f.write(common_schema)

user_schema = '''from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    username: str
    full_name: Optional[str] = None
    role: str
    active: bool
    last_login_at: Optional[datetime] = None
'''
with open(f'{schemas_dir}/user.py', 'w') as f: f.write(user_schema)

employee_schema = '''from datetime import datetime, time
from typing import Optional
from pydantic import BaseModel, ConfigDict

class EmployeeIn(BaseModel):
    code: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = None
    shift_start: Optional[time] = None
    shift_end: Optional[time] = None
    timezone: Optional[str] = None

class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = None
    shift_start: Optional[time] = None
    shift_end: Optional[time] = None
    timezone: Optional[str] = None
    active: Optional[bool] = None

class EmployeeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    email: Optional[str] = None
    department: Optional[str] = None
    title: Optional[str] = None
    shift_start: time
    shift_end: time
    timezone: str
    active: bool
    created_at: datetime
    updated_at: datetime
'''
with open(f'{schemas_dir}/employee.py', 'w') as f: f.write(employee_schema)

attendance_schema = '''from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class AttendanceRow(BaseModel):
    employee_code: str
    employee_name: str
    department: Optional[str] = None
    day: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: str
    minutes_late: int = 0
    dwell_seconds: int = 0

class AttendanceSummary(BaseModel):
    day: date
    total_employees: int
    present: int
    late: int
    absent: int
    on_leave: int
    checked_out: int
    still_in: int

class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_code: str
    day: date
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    status: str
    minutes_late: int
    dwell_seconds: int
    updated_at: datetime
'''
with open(f'{schemas_dir}/attendance.py', 'w') as f: f.write(attendance_schema)

event_schema = '''from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    ts: datetime
    local_ts: Optional[datetime] = None
    camera_id: str
    zone: Optional[str] = None
    type: str
    employee_code: Optional[str] = None
    confidence: Optional[float] = None
    track_id: Optional[int] = None
    meta: dict
'''
with open(f'{schemas_dir}/event.py', 'w') as f: f.write(event_schema)

camera_schema = '''from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    zone: str
    site: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    last_state: Optional[str] = None
    active: bool
'''
with open(f'{schemas_dir}/camera.py', 'w') as f: f.write(camera_schema)

# Remove the old files
import os
try:
    os.remove('backend/app/models.py')
except FileNotFoundError:
    pass

try:
    os.remove('backend/app/schemas.py')
except FileNotFoundError:
    pass

print("Refactoring complete.")
