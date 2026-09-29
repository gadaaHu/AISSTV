"""Import employees from CSV. Usage: python -m scripts.import_employees file.csv"""
import asyncio
import csv
import sys
from datetime import time
from sqlalchemy import select
from app.db import SessionLocal
from app.models import Employee


async def main():
    if len(sys.argv) < 2:
        print("Usage: python -m scripts.import_employees employees.csv")
        return
    with open(sys.argv[1]) as f:
        rows = list(csv.DictReader(f))

    async with SessionLocal() as db:
        for row in rows:
            code = row["code"].strip()
            exists = await db.scalar(select(Employee).where(Employee.code == code))
            if exists:
                print("skip " + code)
                continue
            db.add(Employee(
                code=code,
                name=row["name"].strip(),
                department=row.get("department"),
                shift_start=time(9, 0),
                shift_end=time(18, 0),
            ))
            print("added " + code)
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
