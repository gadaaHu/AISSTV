import os
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status, File, UploadFile
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, require_role
from ..db import get_db
from ..exceptions import Conflict, NotFound
from ..models import Employee, User
from ..schemas import EmployeeIn, EmployeeOut, EmployeeUpdate, Page

router = APIRouter(prefix="/employees", tags=["employees"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(current_user)]


@router.get("", response_model=Page[EmployeeOut])
async def list_employees(
    db: SessionDep, _: CurrentUser,
    q: Optional[str] = Query(None),
    active: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(Employee)
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Employee.code).like(like),
                              func.lower(Employee.name).like(like)))
    if active is not None:
        stmt = stmt.where(Employee.active == active)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = await db.scalars(stmt.order_by(Employee.name).limit(limit).offset(offset))
    return Page[EmployeeOut](
        items=[EmployeeOut.model_validate(e) for e in rows.all()],
        total=total or 0, limit=limit, offset=offset)


@router.get("/{code}", response_model=EmployeeOut)
async def get_employee(code: str, db: SessionDep, _: CurrentUser):
    emp = await db.scalar(select(Employee).where(Employee.code == code))
    if emp is None:
        raise NotFound("Employee not found")
    return emp


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
async def create_employee(
    body: EmployeeIn, db: SessionDep,
    user: Annotated[User, Depends(require_role("admin", "authorizor"))],
):
    exists = await db.scalar(select(Employee.code).where(Employee.code == body.code))
    if exists:
        raise Conflict("Employee code already exists")
    emp = Employee(**body.model_dump(exclude_none=True))
    db.add(emp)
    await db.commit()
    await db.refresh(emp)
    return emp


@router.post("/{code}/face", response_model=dict)
async def upload_employee_face(
    code: str,
    db: SessionDep,
    user: Annotated[User, Depends(require_role("admin", "authorizor"))],
    file: UploadFile = File(...),
):
    emp = await db.scalar(select(Employee).where(Employee.code == code))
    if emp is None:
        raise NotFound("Employee not found")

    os.makedirs("uploads/faces", exist_ok=True)
    safe_code = "".join(c for c in code if c.isalnum() or c in ("-", "_"))
    safe_filename = "".join(c for c in (file.filename or "") if c.isalnum() or c in ("-", "_", "."))
    if not safe_filename:
        safe_filename = "photo.jpg"
    safe_name = f"{safe_code}_{safe_filename}"
    file_path = os.path.join("uploads", "faces", safe_name)
    
    with open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    return {"message": "Face photo saved. Edge nodes will pick it up on next sync.", "path": file_path}


@router.patch("/{code}", response_model=EmployeeOut)
async def update_employee(
    code: str, body: EmployeeUpdate, db: SessionDep,
    user: Annotated[User, Depends(require_role("admin", "authorizor"))],
):
    emp = await db.scalar(select(Employee).where(Employee.code == code))
    if emp is None:
        raise NotFound("Employee not found")
    for k, v in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(emp, k, v)
    await db.commit()
    await db.refresh(emp)
    return emp


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_employee(
    code: str, db: SessionDep,
    user: Annotated[User, Depends(require_role("admin", "authorizor"))],
    hard: bool = Query(False),
):
    emp = await db.scalar(select(Employee).where(Employee.code == code))
    if emp is None:
        raise NotFound("Employee not found")
    if hard:
        try:
            await db.delete(emp)
            await db.commit()
        except Exception:
            await db.rollback()
            raise Conflict("Cannot hard-delete: employee has history")
    else:
        emp.active = False
        await db.commit()
