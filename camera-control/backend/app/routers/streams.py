from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
from typing import Annotated
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import CameraDevice
from ..schemas import StreamOut
from ..stream_manager import start_hls, stop_hls, is_running
from ..config import settings

router = APIRouter(prefix="/streams", tags=["streams"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _rtsp_url(c: CameraDevice, sub: bool = False) -> str:
    path = c.sub_path if sub else c.main_path
    auth = ""
    if c.username:
        auth = f"{c.username}:{c.password or ''}@"
    return f"rtsp://{auth}{c.ip}:{c.rtsp_port}{path}"


@router.post("/{camera_id}/start", response_model=StreamOut)
async def start_stream(camera_id: str, db: SessionDep):
    c = await db.get(CameraDevice, camera_id)
    if c is None:
        raise HTTPException(404, "Camera not found")
    url = _rtsp_url(c, sub=True)
    hls = await start_hls(camera_id, url)
    return StreamOut(camera_id=camera_id, hls_url=hls)


@router.post("/{camera_id}/stop")
async def stop_stream(camera_id: str):
    await stop_hls(camera_id)
    return {"ok": True}


@router.get("/{camera_id}/status")
async def stream_status(camera_id: str):
    return {"camera_id": camera_id, "running": is_running(camera_id)}


@router.get("/{camera_id}/{filename}")
async def serve_hls(camera_id: str, filename: str):
    """Serve HLS playlist and segments directly from the output directory."""
    safe = Path(filename).name
    f = Path(settings.hls_output_dir) / camera_id / safe
    if not f.exists():
        raise HTTPException(404, "Not found")
    mime = "application/vnd.apple.mpegurl" if safe.endswith(".m3u8") else "video/mp2t"
    return FileResponse(f, media_type=mime)