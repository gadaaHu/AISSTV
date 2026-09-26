from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CameraIn(BaseModel):
    id: str
    name: str
    ip: str
    onvif_port: int = 80
    rtsp_port: int = 554
    username: Optional[str] = None
    password: Optional[str] = None
    main_path: str = "/Streaming/Channels/101"
    sub_path: str = "/Streaming/Channels/102"
    zone: Optional[str] = None
    site: Optional[str] = None


class CameraOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    vendor: Optional[str] = None
    model: Optional[str] = None
    ip: str
    onvif_port: int
    rtsp_port: int
    zone: Optional[str] = None
    site: Optional[str] = None
    has_ptz: bool
    active: bool
    last_seen_at: Optional[datetime] = None


class DiscoveredCamera(BaseModel):
    ip: str
    xaddr: str
    scopes: list[str]


class PTZCommand(BaseModel):
    direction: str  # up | down | left | right | zoomin | zoomout | stop | home
    speed: float = 0.5


class PresetIn(BaseModel):
    name: str


class PresetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    camera_id: str
    name: str
    onvif_preset_token: Optional[str] = None


class StreamOut(BaseModel):
    camera_id: str
    hls_url: str
    webrtc_url: Optional[str] = None


class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    camera_id: str
    start_at: datetime
    end_at: Optional[datetime] = None
    duration_sec: Optional[int] = None
    file_path: str
    trigger: str
    status: str