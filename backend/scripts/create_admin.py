"""Create an admin user. Usage: python -m scripts.create_admin"""
import asyncio
import sys
from app.auth import hash_password
from app.config import settings
from app.db import SessionLocal
from app.models import User
from sqlalchemy import select


async def main():
    username = sys.argv[1] if len(sys.argv) > 1 else settings.bootstrap_admin_user
    password = sys.argv[2] if len(sys.argv) > 2 else "admin123"

    async with SessionLocal() as db:
        exists = await db.scalar(select(User).where(User.username == username))
        if exists:
            exists.password_hash = hash_password(password)
            print("Updated password for " + username)
        else:
            db.add(User(username=username, password_hash=hash_password(password), role="admin"))
            print("Created user " + username)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
