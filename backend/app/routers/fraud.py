"""Fraud incidents router."""
from datetime import datetime
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, require_role
from ..db import get_db
from ..exceptions import NotFound
from ..models import Incident, User
from ..schemas import Page
from pydantic import BaseModel, ConfigDict


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    type: str
    severity: str
    status: str
    camera_id: Optional[str] = None
    employee_code: Optional[str] = None
    zone: Optional[str] = None
    description: Optional[str] = None
    evidence: dict
    resolved_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None
    occurred_at: datetime
    created_at: datetime
    updated_at: datetime


class ResolveIn(BaseModel):
    status: str  # resolved | dismissed
    resolution_note: Optional[str] = None


router = APIRouter(prefix="/fraud", tags=["fraud"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


@router.get("", response_model=Page[IncidentOut])
async def list_fraud(
    db: SessionDep, _: CurrentUser,
    status_: Optional[str] = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    stmt = select(Incident).where(Incident.type == "FRAUD")
    if status_:
        stmt = stmt.where(Incident.status == status_)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.scalars(
        stmt.order_by(Incident.occurred_at.desc()).limit(limit).offset(offset)
    )).all()
    return Page[IncidentOut](
        items=[IncidentOut.model_validate(r) for r in rows],
        total=total or 0, limit=limit, offset=offset)


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_fraud(incident_id: str, db: SessionDep, _: CurrentUser):
    inc = await db.get(Incident, incident_id)
    if inc is None or inc.type != "FRAUD":
        raise NotFound("Fraud incident not found")
    return inc


@router.patch("/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_fraud(
    incident_id: str, body: ResolveIn, db: SessionDep,
    user: Annotated[User, Depends(require_role("admin", "manager", "authorizor"))],
):
    inc = await db.get(Incident, incident_id)
    if inc is None or inc.type != "FRAUD":
        raise NotFound("Fraud incident not found")
    inc.status = body.status
    inc.resolved_by = user.username
    inc.resolved_at = datetime.now()
    if body.resolution_note:
        inc.resolution_note = body.resolution_note
    await db.commit()
    await db.refresh(inc)
    return inc
