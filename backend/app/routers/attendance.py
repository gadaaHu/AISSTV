from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user
from ..db import get_db
from ..exceptions import BadRequest
from ..models import Attendance, Employee, User
from ..schemas import AttendanceOut, AttendanceRow, AttendanceSummary, Page

router = APIRouter(prefix="/attendance", tags=["attendance"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


@router.get("", response_model=Page[AttendanceRow])
async def list_attendance(
    db: SessionDep, _: CurrentUser,
    day: Optional[date] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
    employee_code: Optional[str] = None,
    status_: Optional[str] = Query(None, alias="status"),
    limit: int = Query(200, ge=1, le=2000),
    offset: int = Query(0, ge=0),
):
    if day is None and start is None and end is None:
        day = date.today()
    stmt = select(Attendance, Employee).join(Employee, Attendance.employee_code == Employee.code)
    if day is not None:
        stmt = stmt.where(Attendance.day == day)
    elif start and end:
        stmt = stmt.where(Attendance.day >= start, Attendance.day <= end)
    if employee_code:
        stmt = stmt.where(Attendance.employee_code == employee_code)
    if status_:
        stmt = stmt.where(Attendance.status == status_)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = (await db.execute(
        stmt.order_by(Attendance.day.desc(), Employee.name).limit(limit).offset(offset)
    )).all()
    items = [
        AttendanceRow(
            employee_code=att.employee_code, employee_name=emp.name,
            department=emp.department, day=att.day,
            check_in=att.check_in, check_out=att.check_out,
            status=att.status, minutes_late=att.minutes_late or 0,
            dwell_seconds=att.dwell_seconds or 0,
        ) for att, emp in rows
    ]
    return Page[AttendanceRow](items=items, total=total or 0, limit=limit, offset=offset)


@router.get("/summary", response_model=AttendanceSummary)
async def summary(db: SessionDep, _: CurrentUser, day: Optional[date] = None):
    if day is None:
        day = date.today()
    total_active = await db.scalar(select(func.count(Employee.id)).where(Employee.active.is_(True)))
    rows = (await db.execute(
        select(Attendance.status, func.count(Attendance.id))
        .where(Attendance.day == day).group_by(Attendance.status)
    )).all()
    by = {s: c for s, c in rows}
    checked_out = await db.scalar(
        select(func.count(Attendance.id))
        .where(Attendance.day == day, Attendance.check_out.isnot(None)))
    present = by.get("present", 0)
    late = by.get("late", 0)
    leave = by.get("leave", 0) + by.get("holiday", 0)
    half = by.get("half_day", 0)
    absent = max((total_active or 0) - (present + late + half + leave), 0)
    still_in = (present + late) - (checked_out or 0)
    return AttendanceSummary(
        day=day, total_employees=total_active or 0,
        present=present, late=late, absent=absent, on_leave=leave,
        checked_out=checked_out or 0, still_in=max(still_in, 0))


@router.get("/employee/{code}", response_model=list[AttendanceOut])
async def employee_history(
    code: str, db: SessionDep, _: CurrentUser,
    start: date = Query(...), end: date = Query(...),
    limit: int = Query(100, ge=1, le=1000),
):
    rows = (await db.scalars(
        select(Attendance).where(
            Attendance.employee_code == code,
            Attendance.day >= start, Attendance.day <= end,
        ).order_by(Attendance.day.desc()).limit(limit)
    )).all()
    return list(rows)
