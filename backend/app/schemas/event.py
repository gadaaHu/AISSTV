from datetime import datetime
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
