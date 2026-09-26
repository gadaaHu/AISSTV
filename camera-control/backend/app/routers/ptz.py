from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import CameraDevice, PtzPreset
from ..schemas import PTZCommand, PresetIn, PresetOut
from ..onvif_client import OnvifCameraClient

router = APIRouter(prefix="/ptz", tags=["ptz"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]


async def _client(cam: CameraDevice) -> OnvifCameraClient:
    c = OnvifCameraClient(cam.ip, cam.onvif_port, cam.username or "", cam.password or "")
    await c.connect()
    return c


@router.post("/{camera_id}/move")
async def move(camera_id: str, body: PTZCommand, db: SessionDep):
    cam = await db.get(CameraDevice, camera_id)
    if cam is None:
        raise HTTPException(404, "Camera not found")
    if not cam.has_ptz:
        raise HTTPException(400, "Camera does not support PTZ")
    client = await _client(cam)
    try:
        if body.direction == "stop":
            await client.stop()
        else:
            await client.move(body.direction, body.speed)
        return {"ok": True, "direction": body.direction}
    except Exception as e:
        raise HTTPException(502, f"PTZ failed: {e}")


@router.get("/{camera_id}/presets", response_model=list[PresetOut])
async def list_presets(camera_id: str, db: SessionDep):
    rows = (await db.scalars(
        select(PtzPreset).where(PtzPreset.camera_id == camera_id)
    )).all()
    return list(rows)


@router.post("/{camera_id}/presets", response_model=PresetOut, status_code=201)
async def save_preset(camera_id: str, body: PresetIn, db: SessionDep):
    cam = await db.get(CameraDevice, camera_id)
    if cam is None:
        raise HTTPException(404, "Camera not found")
    client = await _client(cam)
    try:
        token = await client.set_preset(body.name)
    except Exception as e:
        raise HTTPException(502, f"Set preset failed: {e}")

    preset = PtzPreset(camera_id=camera_id, name=body.name, onvif_preset_token=token)
    db.add(preset)
    await db.commit()
    await db.refresh(preset)
    return preset


@router.post("/{camera_id}/presets/{preset_id}/goto")
async def goto_preset(camera_id: str, preset_id: str, db: SessionDep):
    preset = await db.get(PtzPreset, preset_id)
    if preset is None or preset.camera_id != camera_id:
        raise HTTPException(404, "Preset not found")
    cam = await db.get(CameraDevice, camera_id)
    client = await _client(cam)
    try:
        await client.goto_preset(preset.onvif_preset_token)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(502, f"Goto preset failed: {e}")