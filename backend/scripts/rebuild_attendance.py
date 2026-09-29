"""Rebuild attendance from events for a day. Usage: python -m scripts.rebuild_attendance 2025-01-15"""
import asyncio
import sys
from datetime import date
from app.db import SessionLocal


async def main():
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.rebuild_attendance YYYY-MM-DD")
        return
    target = date.fromisoformat(sys.argv[1])
    print("Would rebuild attendance for " + str(target))
    print("(Not implemented — event replay is a future feature.)")


if __name__ == "__main__":
    asyncio.run(main())
