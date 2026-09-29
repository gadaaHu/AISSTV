from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class UserIn(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = "viewer"
    active: bool = True

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    full_name: Optional[str] = None
    role: str
    active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime

