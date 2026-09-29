import asyncio
import time
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, require_role
from ..db import get_db
from ..exceptions import Conflict, NotFound
from ..logging_conf import get_logger
from ..models import Camera, User

log = get_logger(__name__)
router = APIRouter(prefix="/cameras", tags=["cameras"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


class CameraIn(BaseModel):
    id: Annotated[str, Field(min_length=2, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")]
    name: str = ""
    zone: str
    site: Optional[str] = None
    url: str
    rtsp_transport: str = "tcp"
    username: Optional[str] = None
    password: Optional[str] = None
    enabled: bool = True
    fps_process: float = 3.0
    detection_confidence: float = 0.45
    face_threshold: float = 0.45
    save_snapshots: bool = False
    tags: list[str] = []
    notes: Optional[str] = None


class CameraUpdate(BaseModel):
    name: Optional[str] = None
    zone: Optional[str] = None
    site: Optional[str] = None
    url: Optional[str] = None
    rtsp_transport: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    enabled: Optional[bool] = None
    fps_process: Optional[float] = None
    detection_confidence: Optional[float] = None
    face_threshold: Optional[float] = None
    save_snapshots: Optional[bool] = None
    tags: Optional[list[str]] = None
    notes: Optional[str] = None
    active: Optional[bool] = None


class CameraOut(BaseModel):
    model_config = {"from_attributes": True}
    id: str
    name: str
    zone: str
    site: Optional[str]
    url: str
    rtsp_transport: str
    username: Optional[str]
    enabled: bool
    fps_process: float
    detection_confidence: float
    face_threshold: float
    save_snapshots: bool
    tags: list
    notes: Optional[str]
    last_seen_at: Optional[datetime]
    last_state: Optional[str]
    last_error: Optional[str]
    edge_node: Optional[str]
    active: bool
    created_at: datetime
    updated_at: datetime
    online: bool = False


class TestResult(BaseModel):
    ok: bool
    message: str
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    codec: Optional[str] = None
    latency_ms: Optional[int] = None


class TestUrlIn(BaseModel):
    url: str
    rtsp_transport: str = "tcp"


def _is_online(c: Camera) -> bool:
    if not c.last_seen_at:
        return False
    return (datetime.now(timezone.utc) - c.last_seen_at).total_seconds() < 60


async def _probe_rtsp(url: str, transport: str = "tcp", timeout: int = 8) -> TestResult:
    t0 = time.perf_counter()
    cmd = [
        "ffprobe", "-v", "error",
        "-rtsp_transport", transport,
        "-timeout", str(timeout * 1_000_000),
        "-i", url,
        "-show_entries", "stream=width,height,r_frame_rate,codec_name",
        "-of", "default=noprint_wrappers=1",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout + 2)
    except asyncio.TimeoutError:
        return TestResult(ok=False, message=f"Timeout after {timeout}s")
    except FileNotFoundError:
        return TestResult(ok=False, message="ffprobe not installed on server")
    except Exception as e:
        return TestResult(ok=False, message=f"Probe failed: {e}")

    latency = int((time.perf_counter() - t0) * 1000)

    if proc.returncode != 0:
        err = stderr.decode("utf-8", errors="ignore").strip().splitlines()
        return TestResult(ok=False, message=(err[-1] if err else "Unknown error"), latency_ms=latency)

    fields = dict(
        line.split("=", 1) for line in stdout.decode("utf-8", errors="ignore").splitlines() if "=" in line
    )
    width = int(fields["width"]) if fields.get("width", "").isdigit() else None
    height = int(fields["height"]) if fields.get("height", "").isdigit() else None
    codec = fields.get("codec_name")
    fps = None
    if fields.get("r_frame_rate", "").count("/"):
        num, den = fields["r_frame_rate"].split("/")
        if den != "0":
            fps = round(float(num) / float(den), 2)
    return TestResult(ok=True, message="Stream OK", width=width, height=height, fps=fps, codec=codec, latency_ms=latency)


def _build_url(cam: Camera) -> str:
    if cam.username and cam.password and "@" not in cam.url:
        scheme, rest = cam.url.split("://", 1)
        return f"{scheme}://{cam.username}:{cam.password}@{rest}"
    return cam.url


@router.get("", response_model=list[CameraOut])
async def list_cameras(db: SessionDep, _: CurrentUser, enabled_only: bool = Query(False)):
    stmt = select(Camera).where(Camera.active.is_(True))
    if enabled_only:
        stmt = stmt.where(Camera.enabled.is_(True))
    rows = (await db.scalars(stmt.order_by(Camera.id))).all()
    out = []
    for c in rows:
        o = CameraOut.model_validate(c)
        o.online = _is_online(c)
        out.append(o)
    return out


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(camera_id: str, db: SessionDep, _: CurrentUser):
    cam = await db.get(Camera, camera_id)
    if cam is None or not cam.active:
        raise NotFound("Camera not found")
    o = CameraOut.model_validate(cam)
    o.online = _is_online(cam)
    return o


@router.post("", response_model=CameraOut, status_code=status.HTTP_201_CREATED)
async def create_camera(body: CameraIn, db: SessionDep,
                        user: Annotated[User, Depends(require_role("admin"))]):
    exists = await db.get(Camera, body.id)
    if exists:
        raise Conflict(f"Camera id {body.id!r} already exists")
    cam = Camera(**body.model_dump())
    db.add(cam)
    await db.commit()
    await db.refresh(cam)
    _notify_edge()
    o = CameraOut.model_validate(cam)
    o.online = False
    return o


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(camera_id: str, body: CameraUpdate, db: SessionDep,
                        user: Annotated[User, Depends(require_role("admin"))]):
    cam = await db.get(Camera, camera_id)
    if cam is None or not cam.active:
        raise NotFound("Camera not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(cam, k, v)
    await db.commit()
    await db.refresh(cam)
    _notify_edge()
    o = CameraOut.model_validate(cam)
    o.online = _is_online(cam)
    return o


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_camera(camera_id: str, db: SessionDep,
                            user: Annotated[User, Depends(require_role("admin"))]):
    cam = await db.get(Camera, camera_id)
    if cam is None:
        raise NotFound("Camera not found")
    cam.active = False
    cam.enabled = False
    await db.commit()
    _notify_edge()


@router.post("/{camera_id}/test", response_model=TestResult)
async def test_camera(camera_id: str, db: SessionDep, _: CurrentUser):
    cam = await db.get(Camera, camera_id)
    if cam is None:
        raise NotFound("Camera not found")
    return await _probe_rtsp(_build_url(cam), cam.rtsp_transport)


@router.post("/test-url", response_model=TestResult)
async def test_url(body: TestUrlIn, _: CurrentUser):
    return await _probe_rtsp(body.url, body.rtsp_transport)


@router.get("/{camera_id}/snapshot")
async def snapshot(camera_id: str, db: SessionDep, _: CurrentUser):
    cam = await db.get(Camera, camera_id)
    if cam is None:
        raise NotFound("Camera not found")
    url = _build_url(cam)
    cmd = [
        "ffmpeg", "-y",
        "-rtsp_transport", cam.rtsp_transport,
        "-i", url,
        "-frames:v", "1",
        "-f", "image2",
        "-vcodec", "mjpeg",
        "pipe:1",
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
    except Exception as e:
        raise HTTPException(500, f"Snapshot failed: {e}")
    if not stdout:
        raise HTTPException(502, "No frame from camera")
    return StreamingResponse(iter([stdout]), media_type="image/jpeg",
                             headers={"Cache-Control": "no-cache"})


def _notify_edge():
    try:
        from ..consumer import _mqtt_client_ref
        if _mqtt_client_ref:
            _mqtt_client_ref.publish("attendance/commands/camera-config",
                                     "{\"cmd\": \"reload\"}", qos=1)
            log.info("edge_notified_config_change")
    except Exception:
        log.exception("config_notify_failed")
