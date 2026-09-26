from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..models import Recording
from ..schemas import RecordingOut

router = APIRouter(prefix="/recordings", tags=["recordings"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[RecordingOut])
async def list_recordings(
    db: SessionDep,
    camera_id: str | None = None,
    limit: int = 100,
):
    stmt = select(Recording).order_by(desc(Recording.start_at)).limit(limit)
    if camera_id:
        stmt = stmt.where(Recording.camera_id == camera_id)
    return list((await db.scalars(stmt)).all())


@router.get("/{recording_id}", response_model=RecordingOut)
async def get_recording(recording_id: str, db: SessionDep):
    r = await db.get(Recording, recording_id)
    if r is None:
        raise HTTPException(404, "Recording not found")
    return r


@router.delete("/{recording_id}", status_code=204)
async def delete_recording(recording_id: str, db: SessionDep):
    r = await db.get(Recording, recording_id)
    if r is None:
        raise HTTPException(404, "Recording not found")
    await db.delete(r)
    await db.commit()