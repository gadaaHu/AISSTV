from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from sqlalchemy import text

from .config import settings
from .db import close_db, engine
from .logging_conf import get_logger, setup_logging
from .routers import cameras, streams, ptz, recordings

setup_logging()
log = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("startup_begin", env=settings.env)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        log.info("db_connection_ok")
    except Exception:
        log.exception("db_unreachable")
        raise

    Path(settings.hls_output_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.recordings_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.snapshots_dir).mkdir(parents=True, exist_ok=True)

    log.info("startup_complete")
    yield
    log.info("shutdown_begin")
    await close_db()
    log.info("shutdown_complete")


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["ops"])
async def health():
    db_ok = True
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "service": "camera-control", "db": db_ok}


@app.get("/", tags=["ops"])
async def root():
    return {"service": settings.app_name, "version": "1.0.0"}


app.include_router(cameras.router)
app.include_router(streams.router)
app.include_router(ptz.router)
app.include_router(recordings.router)

# Serve HLS files
app.mount("/streams", StaticFiles(directory=settings.hls_output_dir), name="streams")