from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from .config import settings
from .consumer import start_consumer, stop_consumer
from .db import close_db, engine
from .exceptions import install_exception_handlers
from .logging_conf import get_logger, setup_logging
from .middleware import RequestContextMiddleware
from .scheduler import start_scheduler, stop_scheduler
from .watchlist_sync import init_watchlist_publisher, stop_watchlist_publisher

setup_logging()
log = get_logger(__name__)


from .bootstrap import bootstrap_data
from .db import SessionLocal, close_db, engine

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup_begin", env=settings.env)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        log.info("db_connection_ok")
        
        async with SessionLocal() as db:
            await bootstrap_data(db)
    except Exception:
        log.exception("startup_failed")
        raise

    mqtt_client = start_consumer()
    app.state.mqtt_client = mqtt_client
    init_watchlist_publisher()
    start_scheduler()
    log.info("startup_complete")

    yield

    log.info("shutdown_begin")
    stop_scheduler()
    stop_watchlist_publisher()
    stop_consumer(mqtt_client)
    await close_db()
    log.info("shutdown_complete")


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
app.add_middleware(RequestContextMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
install_exception_handlers(app)


@app.get("/health", tags=["ops"])
async def health():
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "env": settings.env, "db": db_ok}


@app.get("/", tags=["ops"])
async def root():
    return {"service": settings.app_name, "version": "1.0.0", "docs": "/docs"}


from .routers import auth_routes, employees, attendance, events
app.include_router(auth_routes.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(events.router)
