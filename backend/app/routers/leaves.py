"""Leave requests — full CRUD + approval workflow."""
from datetime import date, datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, require_role
from ..db import get_db
from ..exceptions import BadRequest, Conflict, NotFound
from ..models import LeaveRequest, User
from ..schemas import Page
from pydantic import BaseModel, ConfigDict


class LeaveIn(BaseModel):
    employee_code: str
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None


class LeaveReviewIn(BaseModel):
    status: str   # approved | rejected
    note: Optional[str] = None


class LeaveOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_code: str
    leave_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


router = APIRouter(prefix="/leaves", tags=["leaves"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


@router.get("", response_model=Page[LeaveOut])
async def list_leaves(
    db: SessionDep, _: CurrentUser,
    employee_code: Optional[str] = None,
    status_: Optional[str] = Query(None, alias="status"),
    start: Optional[date] = None,
    end: Optional[date] = None,
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
):
    stmt = select(LeaveRequest)
    if employee_code:
        stmt = stmt.where(LeaveRequest.employee_code == employee_code)
    if status_:
        stmt = stmt.where(LeaveRequest.status == status_)
    if start:
        stmt = stmt.where(LeaveRequest.end_date >= start)
    if end:
        stmt = stmt.where(LeaveRequest.start_date <= end)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.scalars(
        stmt.order_by(LeaveRequest.start_date.desc()).limit(limit).offset(offset)
    )).all()
    return Page[LeaveOut](
        items=[LeaveOut.model_validate(r) for r in rows],
        total=total or 0, limit=limit, offset=offset)


@router.get("/{leave_id}", response_model=LeaveOut)
async def get_leave(leave_id: str, db: SessionDep, _: CurrentUser):
    lr = await db.get(LeaveRequest, leave_id)
    if lr is None:
        raise NotFound("Leave request not found")
    return lr


@router.post("", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
async def create_leave(body: LeaveIn, db: SessionDep, _: CurrentUser):
    if body.end_date < body.start_date:
        raise BadRequest("end_date must be >= start_date")
    # Check for overlapping approved/pending leaves
    overlap = await db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.employee_code == body.employee_code,
            LeaveRequest.status.in_(["pending", "approved"]),
            LeaveRequest.start_date <= body.end_date,
            LeaveRequest.end_date >= body.start_date,
        )
    )
    if overlap:
        raise Conflict("Overlapping leave request already exists")
    lr = LeaveRequest(**body.model_dump())
    db.add(lr)
    await db.commit()
    await db.refresh(lr)
    return lr


@router.patch("/{leave_id}/review", response_model=LeaveOut)
async def review_leave(
    leave_id: str, body: LeaveReviewIn, db: SessionDep,
    user: Annotated[User, Depends(require_role("admin", "manager"))],
):
    if body.status not in ("approved", "rejected"):
        raise BadRequest("status must be 'approved' or 'rejected'")
    lr = await db.get(LeaveRequest, leave_id)
    if lr is None:
        raise NotFound("Leave request not found")
    if lr.status != "pending":
        raise Conflict(f"Leave request is already '{lr.status}'")
    lr.status = body.status
    lr.reviewed_by = user.username
    lr.reviewed_at = datetime.now(timezone.utc)
    if body.note:
        lr.reason = (lr.reason or "") + f"\n[Review note] {body.note}"
    await db.commit()
    await db.refresh(lr)
    return lr


@router.delete("/{leave_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_leave(leave_id: str, db: SessionDep, user: CurrentUser):
    lr = await db.get(LeaveRequest, leave_id)
    if lr is None:
        raise NotFound("Leave request not found")
    if lr.status == "approved":
        raise Conflict("Cannot cancel an already approved request — reject it instead")
    await db.delete(lr)
    await db.commit()
