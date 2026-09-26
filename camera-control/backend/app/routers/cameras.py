from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import CameraDevice
from ..schemas import CameraIn, CameraOut, DiscoveredCamera
from ..discovery import discover_onvif
from ..onvif_client import OnvifCameraClient

router = APIRouter(prefix="/cameras", tags=["cameras"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("/discover", response_model=list[DiscoveredCamera])
async def discover():
    """Find SSTV / ONVIF cameras on the local network via WS-Discovery."""
    return await discover_onvif(timeout=5)


@router.get("", response_model=list[CameraOut])
async def list_cameras(db: SessionDep):
    return list((await db.scalars(select(CameraDevice).order_by(CameraDevice.name))).all())


@router.get("/{camera_id}", response_model=CameraOut)
async def get_camera(camera_id: str, db: SessionDep):
    c = await db.get(CameraDevice, camera_id)
    if c is None:
        raise HTTPException(404, "Camera not found")
    return c


@router.post("", response_model=CameraOut, status_code=201)
async def add_camera(body: CameraIn, db: SessionDep):
    if await db.get(CameraDevice, body.id):
        raise HTTPException(409, "Camera ID already exists")

    cam = CameraDevice(**body.model_dump())
    db.add(cam)
    await db.commit()
    await db.refresh(cam)
    return cam


@router.delete("/{camera_id}", status_code=204)
async def delete_camera(camera_id: str, db: SessionDep):
    c = await db.get(CameraDevice, camera_id)
    if c is None:
        raise HTTPException(404, "Camera not found")
    await db.delete(c)
    await db.commit()


@router.post("/{camera_id}/probe")
async def probe_camera(camera_id: str, db: SessionDep):
    """Connect to the camera via ONVIF and pull device info."""
    c = await db.get(CameraDevice, camera_id)
    if c is None:
        raise HTTPException(404, "Camera not found")

    client = OnvifCameraClient(c.ip, c.onvif_port, c.username or "", c.password or "")
    try:
        info = await client.device_info()
        c.vendor = info.get("manufacturer")
        c.model = info.get("model")
        c.firmware = info.get("firmware")
        c.last_seen_at = datetime.now(timezone.utc)
        c.capabilities = info
        await db.commit()
        return {"ok": True, "info": info}
    except Exception as e:
        raise HTTPException(502, f"Probe failed: {e}")