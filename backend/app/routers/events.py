from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_db
from ..exceptions import NotFound
from ..models import Camera, Event, User
from ..schemas import CameraOut, EventOut, Page

router = APIRouter(prefix="/events", tags=["events"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


@router.get("/cameras/list", response_model=list[CameraOut])
async def list_cameras(db: SessionDep, _: CurrentUser):
    return list((await db.scalars(select(Camera).order_by(Camera.id))).all())


@router.get("", response_model=Page[EventOut])
async def list_events(
    db: SessionDep, _: CurrentUser,
    since: Optional[datetime] = None,
    camera_id: Optional[str] = None,
    type_: Optional[str] = Query(None, alias="type"),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    if since is None:
        since = datetime.now(timezone.utc) - timedelta(minutes=60)
    stmt = select(Event).where(Event.ts >= since)
    if camera_id:
        stmt = stmt.where(Event.camera_id == camera_id)
    if type_:
        stmt = stmt.where(Event.type == type_)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = (await db.scalars(stmt.order_by(desc(Event.ts)).limit(limit).offset(offset))).all()
    return Page[EventOut](
        items=[EventOut.model_validate(e) for e in items],
        total=total or 0, limit=limit, offset=offset)


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: str, db: SessionDep, _: CurrentUser):
    ev = await db.get(Event, event_id)
    if ev is None:
        raise NotFound("Event not found")
    return ev
