import asyncio
from .logging_conf import get_logger

log = get_logger(__name__)
_running = False
_tasks: list = []


async def _loop(name: str, interval: int):
    while _running:
        try:
            log.debug("scheduler_tick", name=name)
        except Exception:
            log.exception("scheduler_error", name=name)
        await asyncio.sleep(interval)


def start_scheduler() -> None:
    global _running
    _running = True
    _tasks.append(asyncio.create_task(_loop("reconcile", 60), name="reconcile"))
    _tasks.append(asyncio.create_task(_loop("escalation", 5), name="escalation"))
    log.info("scheduler_started")


def stop_scheduler() -> None:
    global _running
    _running = False
    for t in _tasks:
        if not t.done():
            t.cancel()
