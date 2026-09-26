import logging
import sys

import structlog

from .config import settings


def setup_logging() -> None:
    logging.basicConfig(
        format="%(message)s", stream=sys.stdout,
        level=getattr(logging, settings.log_level),
    )
    shared = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]
    if settings.log_json:
        processors = shared + [structlog.processors.JSONRenderer()]
    else:
        processors = shared + [structlog.dev.ConsoleRenderer(colors=True)]
    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level)),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("paho.mqtt").setLevel(logging.WARNING)


def get_logger(name: str):
    return structlog.get_logger(name)
