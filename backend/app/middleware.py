import time
import uuid
import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)

    async def dispatch(self, request, call_next):
        rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=rid)
        start = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        response.headers["X-Response-Time-ms"] = str(int((time.perf_counter() - start) * 1000))
        return response
