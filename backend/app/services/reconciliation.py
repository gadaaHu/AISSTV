"""Attendance reconciliation — expected vs actual."""
from datetime import date, time, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..logging_conf import get_logger
from ..models import (
    Attendance, Employee, Holiday, LeaveRequest, WorkSchedule,
)

log = get_logger(__name__)


async def expected_for_employee_day(
    db: AsyncSession,
    employee: Employee,
    day: date,
    site: str | None = None,
) -> dict:
    # 1. Holiday?
    hol = await db.scalar(
        select(Holiday).where(
            Holiday.day == day,
            or_(Holiday.site == site, Holiday.site.is_(None)),
        )
    )
    if hol:
        return {"status": "holiday", "leave_type": None, "leave_request_id": None,
                "shift_start": None, "shift_end": None}

    # 2. Approved leave?
    leave = await db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.employee_code == employee.code,
            LeaveRequest.status == "approved",
            LeaveRequest.start_date <= day,
            LeaveRequest.end_date >= day,
        )
    )
    if leave:
        return {"status": "leave", "leave_type": leave.leave_type,
                "leave_request_id": leave.id, "shift_start": None, "shift_end": None}

    # 3. Schedule override?
    sched = await db.scalar(
        select(WorkSchedule).where(
            WorkSchedule.employee_code == employee.code,
            WorkSchedule.weekday == day.weekday(),
        )
    )
    if sched is not None:
        if not sched.is_working:
            return {"status": "off", "leave_type": None, "leave_request_id": None,
                    "shift_start": None, "shift_end": None}
        return {"status": "workday", "leave_type": None, "leave_request_id": None,
                "shift_start": sched.shift_start or employee.shift_start,
                "shift_end": sched.shift_end or employee.shift_end}

    # 4. Default Mon-Fri
    if day.weekday() >= 5:
        return {"status": "off", "leave_type": None, "leave_request_id": None,
                "shift_start": None, "shift_end": None}

    return {"status": "workday", "leave_type": None, "leave_request_id": None,
            "shift_start": employee.shift_start, "shift_end": employee.shift_end}


def _expected_to_string(exp: dict) -> str:
    if exp["status"] == "workday":
        return "expected_present"
    if exp["status"] == "leave":
        return f"expected_leave:{exp['leave_type']}"
    if exp["status"] == "holiday":
        return "expected_holiday"
    return "expected_off"


async def reconcile_employee_day(
    db: AsyncSession, employee: Employee, day: date, site: str | None = None
) -> Attendance:
    exp = await expected_for_employee_day(db, employee, day, site=site)

    att = await db.scalar(
        select(Attendance).where(
            Attendance.employee_code == employee.code,
            Attendance.day == day,
        )
    )
    if att is None:
        att = Attendance(employee_code=employee.code, day=day, status="absent")
        db.add(att)

    has_checkin = att.check_in is not None

    if exp["status"] == "holiday":
        att.status = "holiday"
    elif exp["status"] == "leave":
        att.status = "leave"
    elif exp["status"] == "off":
        att.status = "off" if not has_checkin else "present"
    else:  # workday
        if not has_checkin:
            att.status = "absent"
        else:
            dwell = att.dwell_seconds or 0
            if 0 < dwell < 4 * 3600:
                att.status = "half_day"

    att.expected_status = _expected_to_string(exp)
    att.expected_leave_type = exp["leave_type"]
    att.has_exception = _flag_exception(att, exp)

    return att


def _flag_exception(att: Attendance, exp: dict) -> bool:
    exp_str = _expected_to_string(exp)
    if exp_str == "expected_present":
        if att.status in ("absent", "leave", "holiday"):
            return True
        if att.status == "late" and (att.minutes_late or 0) > 60:
            return True
    elif exp_str.startswith("expected_leave"):
        if att.status == "present":
            return True
    elif exp_str == "expected_off":
        if att.status == "present":
            return True
    return False


async def reconcile_day(
    db: AsyncSession, day: date, site: str | None = None
) -> dict:
    employees = (await db.scalars(select(Employee).where(Employee.active.is_(True)))).all()

    stats = {"employees": len(employees), "created": 0, "updated": 0,
             "absent": 0, "leave": 0, "holiday": 0, "off": 0,
             "present": 0, "late": 0, "half_day": 0}

    for emp in employees:
        existed = await db.scalar(
            select(Attendance.id).where(
                Attendance.employee_code == emp.code,
                Attendance.day == day,
            )
        )
        att = await reconcile_employee_day(db, emp, day, site=site)
        stats["updated" if existed else "created"] += 1
        if att.status in stats:
            stats[att.status] += 1

    await db.commit()
    log.info("reconcile_day_done", day=str(day), **stats)
    return stats


async def reconcile_range(
    db: AsyncSession, start: date, end: date, site: str | None = None
) -> dict:
    total = {}
    d = start
    while d <= end:
        total[str(d)] = await reconcile_day(db, d, site=site)
        d += timedelta(days=1)
    return total