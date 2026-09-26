from datetime import datetime, time
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
