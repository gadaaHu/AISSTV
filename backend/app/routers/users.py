from typing import Annotated, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, hash_password, require_role
from ..db import get_db
from ..exceptions import Conflict, NotFound
from ..models import User
from ..schemas import Page, UserIn, UserOut, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])
SessionDep = Annotated[AsyncSession, Depends(get_db)]
AdminUser = Annotated[User, Depends(require_role("admin", "authorizor"))]


@router.get("", response_model=Page[UserOut])
async def list_users(
    db: SessionDep, _: AdminUser,
    active: Optional[bool] = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    stmt = select(User)
    if active is not None:
        stmt = stmt.where(User.active == active)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = await db.scalars(stmt.order_by(User.username).limit(limit).offset(offset))
    return Page[UserOut](
        items=[UserOut.model_validate(u) for u in rows.all()],
        total=total or 0, limit=limit, offset=offset)


@router.get("/{username}", response_model=UserOut)
async def get_user(username: str, db: SessionDep, _: AdminUser):
    u = await db.scalar(select(User).where(User.username == username))
    if u is None:
        raise NotFound("User not found")
    return u


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserIn, db: SessionDep, _: AdminUser):
    exists = await db.scalar(select(User.username).where(User.username == body.username))
    if exists:
        raise Conflict("Username already exists")
    
    u = User(
        username=body.username,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        active=body.active
    )
    db.add(u)
    await db.commit()
    await db.refresh(u)
    return u


@router.patch("/{username}", response_model=UserOut)
async def update_user(username: str, body: UserUpdate, db: SessionDep, _: AdminUser):
    u = await db.scalar(select(User).where(User.username == username))
    if u is None:
        raise NotFound("User not found")
    
    for k, v in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(u, k, v)
    
    await db.commit()
    await db.refresh(u)
    return u


@router.delete("/{username}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_user(username: str, db: SessionDep, _: AdminUser):
    u = await db.scalar(select(User).where(User.username == username))
    if u is None:
        raise NotFound("User not found")
    u.active = False
    await db.commit()
