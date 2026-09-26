from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from ..auth import current_user, hash_password, perform_login, verify_password
from ..db import get_db
from ..exceptions import BadRequest
from ..models import User
from ..schemas import ChangePasswordIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenOut:
    token, expires_at, _ = await perform_login(db, form.username, form.password)
    seconds = int((expires_at - datetime.now(timezone.utc)).total_seconds())
    return TokenOut(access_token=token, expires_in=seconds)


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(current_user)]):
    return user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordIn,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if not verify_password(body.old_password, user.password_hash):
        raise BadRequest("Old password is incorrect")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
