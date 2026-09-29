"""Operational endpoints."""
from fastapi import APIRouter

from ..consumer import STATS

router = APIRouter(prefix="/_ops", tags=["ops"])


@router.get("/consumer")
async def consumer_stats():
    return STATS.snapshot()
