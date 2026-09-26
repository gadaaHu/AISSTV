from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_db
from .exceptions import Forbidden, Unauthorized
from .logging_conf import get_logger
from .models import User

log = get_logger(__name__)
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_DUMMY = _pwd.hash("dummy-do-not-use")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(p: str) -> str:
    return _pwd.hash(p)


def verify_password(p: str, h: str) -> bool:
    try:
        return _pwd.verify(p, h)
    except Exception:
        return False


def create_access_token(subject: str, role: str):
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "role": role, "iat": int(now.timestamp()),
               "exp": int(exp.timestamp()), "iss": settings.app_name}
    token = jwt.encode(payload, settings.jwt_secret.get_secret_value(),
                       algorithm=settings.jwt_algorithm)
    return token, exp


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret.get_secret_value(),
                          algorithms=[settings.jwt_algorithm],
                          issuer=settings.app_name)
    except JWTError as e:
        log.info("token_rejected", reason=str(e))
        raise Unauthorized("Invalid or expired token")


async def current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    payload = decode_token(token)
    username = payload.get("sub")
    if not username:
        raise Unauthorized("Malformed token")
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise Unauthorized("User no longer exists")
    if not user.active:
        raise Forbidden("Account disabled")
    return user


def require_role(*roles: str):
    async def _dep(user: Annotated[User, Depends(current_user)]) -> User:
        if user.role not in roles:
            raise Forbidden("Insufficient permissions")
        return user
    return _dep


async def authenticate_user(db, username: str, password: str):
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        _pwd.verify(password, _DUMMY)
        return None
    if not user.active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


async def perform_login(db, username: str, password: str):
    user = await authenticate_user(db, username, password)
    if user is None:
        raise Unauthorized("Incorrect username or password")
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    token, expires_at = create_access_token(user.username, user.role)
    log.info("login_success", username=user.username, role=user.role)
    return token, expires_at, user
