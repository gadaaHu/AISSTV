"""Server-Sent Events stream for fraud and safety alerts."""
import asyncio
import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..alerts import alert_manager
from ..auth import current_user
from ..models import User

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/stream")
async def stream_alerts(
    request: Request,
    user: Annotated[User, Depends(current_user)],
) -> StreamingResponse:
    client_id = str(uuid.uuid4())
    queue = await alert_manager.subscribe(client_id)

    async def event_source():
        try:
            yield f"event: hello\ndata: {json.dumps({'client_id': client_id})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    alert = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"event: fraud\ndata: {json.dumps(alert, default=str)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            await alert_manager.unsubscribe(client_id)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )