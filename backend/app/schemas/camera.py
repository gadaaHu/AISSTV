from datetime import datetime
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
