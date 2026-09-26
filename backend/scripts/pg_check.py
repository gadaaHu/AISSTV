import asyncio
import sys
from sqlalchemy import text
from app.config import settings
from app.db import engine


async def main():
    print(f"Connecting to: {settings.database_url}")
    try:
        async with engine.connect() as conn:
            v = await conn.scalar(text("SELECT version()"))
            print("OK:", v)
            tables = (await conn.execute(text(
                "SELECT tablename FROM pg_tables WHERE schemaname = \x27public\x27 ORDER BY tablename"
            ))).scalars().all()
            print("Tables:", tables or "(none)")
    except Exception as e:
        print("FAILED:", e)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
