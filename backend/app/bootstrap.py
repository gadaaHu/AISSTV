import logging
from datetime import time

from sqlalchemy import select

from .auth import hash_password
from .config import settings
from .models.user import User
from .models.employee import Employee

log = logging.getLogger("bootstrap")

async def upsert_user(db, username, password, role="admin"):
    u = await db.scalar(select(User).where(User.username == username))
    if u:
        return u
    u = User(username=username, password_hash=hash_password(password), role=role)
    db.add(u)
    log.info("created user %s", username)
    return u

async def upsert_employee(db, code, name, department=None):
    e = await db.scalar(select(Employee).where(Employee.code == code))
    if e:
        return e
    e = Employee(code=code, name=name, department=department,
                 shift_start=time(9, 0), shift_end=time(18, 0))
    db.add(e)
    log.info("created employee %s (%s)", code, name)
    return e

async def bootstrap_data(db):
    try:
        await upsert_user(db, settings.bootstrap_admin_user,
                          settings.bootstrap_admin_password.get_secret_value(), role="admin")
        await upsert_employee(db, "emp-001", "Abebe Kebede", "Operations")
        await upsert_employee(db, "emp-002", "Sara Lemma", "Finance")
        await db.commit()
        log.info("bootstrap complete")
    except Exception:
        await db.rollback()
        log.exception("bootstrap failed")
        raise
