from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    username: str
    full_name: Optional[str] = None
    role: str
    active: bool
    last_login_at: Optional[datetime] = None
