from datetime import date, datetime
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
