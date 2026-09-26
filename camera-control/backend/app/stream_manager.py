"""Turns RTSP cameras into browser-playable HLS streams using ffmpeg."""
import asyncio
import logging
import os
import shutil
import uuid
from pathlib import Path
from typing import Optional

from .config import settings

log = logging.getLogger(__name__)
_active: dict[str, asyncio.subprocess.Process] = {}


def _hls_dir(camera_id: str) -> Path:
    p = Path(settings.hls_output_dir) / camera_id
    p.mkdir(parents=True, exist_ok=True)
    return p


async def start_hls(camera_id: str, rtsp_url: str) -> str:
    """Start an ffmpeg process that produces HLS segments. Returns the .m3u8 URL path."""
    if camera_id in _active:
        proc = _active[camera_id]
        if proc.returncode is None:
            return f"/streams/{camera_id}/index.m3u8"
        _active.pop(camera_id, None)

    out_dir = _hls_dir(camera_id)
    for f in out_dir.glob("*"):
        try:
            f.unlink()
        except Exception:
            pass

    m3u8 = out_dir / "index.m3u8"
    cmd = [
        "ffmpeg",
        "-hide_banner", "-loglevel", "warning",
        "-rtsp_transport", settings.default_rtsp_transport,
        "-i", rtsp_url,
        "-c:v", "copy",
        "-an",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", str(out_dir / "seg_%05d.ts"),
        str(m3u8),
    ]
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    _active[camera_id] = proc
    log.info("started_hls camera=%s pid=%s", camera_id, proc.pid)
    return f"/streams/{camera_id}/index.m3u8"


async def stop_hls(camera_id: str):
    proc = _active.pop(camera_id, None)
    if proc and proc.returncode is None:
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=5)
        except Exception:
            proc.kill()
    log.info("stopped_hls camera=%s", camera_id)


def is_running(camera_id: str) -> bool:
    proc = _active.get(camera_id)
    return proc is not None and proc.returncode is None