import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

# Ensure uploads directory exists before app is constructed (StaticFiles needs it at mount time)
os.makedirs("uploads/faces", exist_ok=True)

from .config import settings
from .consumer import start_consumer, stop_consumer
from .db import SessionLocal, close_db, engine
from .exceptions import install_exception_handlers
from .logging_conf import get_logger, setup_logging
from .middleware import RequestContextMiddleware
from .scheduler import start_scheduler, stop_scheduler
from .watchlist_sync import init_watchlist_publisher, stop_watchlist_publisher

setup_logging()
log = get_logger(__name__)


from .bootstrap import bootstrap_data

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup_begin", env=settings.env)

    # Ensure upload directories exist before anything else
    os.makedirs("uploads/faces", exist_ok=True)

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
cors_kwargs = {
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if "*" in settings.cors_origins:
    cors_kwargs["allow_origin_regex"] = ".*"
else:
    cors_kwargs["allow_origins"] = settings.cors_origins

app.add_middleware(CORSMiddleware, **cors_kwargs)
install_exception_handlers(app)

from fastapi.responses import FileResponse
from fastapi import Response, Depends
from .auth import current_user
from .models import User

@app.get("/uploads/faces/{filename}", tags=["uploads"])
async def get_face_photo(filename: str, _: User = Depends(current_user)):
    file_path = os.path.join("uploads", "faces", filename)
    if not os.path.isfile(file_path) or ".." in filename or "/" in filename or "\\" in filename:
        from .exceptions import NotFound
        raise NotFound("Photo not found")
    return FileResponse(file_path)


@app.get("/health", tags=["ops"])
async def health(response: Response):
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
        response.status_code = 503
    return {"status": "ok" if db_ok else "degraded", "env": settings.env, "db": db_ok}


@app.get("/", tags=["ops"])
async def root():
    return {"service": settings.app_name, "version": "1.0.0", "docs": "/docs"}


from .routers import (
    auth_routes, employees, attendance, events, cameras,
    leaves, candidates, fraud, safety, panic, health_extras, users
)
app.include_router(auth_routes.router)
app.include_router(employees.router)
app.include_router(attendance.router)
app.include_router(events.router)
app.include_router(cameras.router)
app.include_router(leaves.router)
app.include_router(candidates.router)
app.include_router(fraud.router)
app.include_router(safety.router)
app.include_router(panic.router)
app.include_router(health_extras.router)
app.include_router(users.router)
