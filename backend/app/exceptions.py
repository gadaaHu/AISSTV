from typing import Any
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from .logging_conf import get_logger

log = get_logger(__name__)


class AppError(Exception):
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "internal_error"
    def __init__(self, message: str, **ctx: Any):
        self.message = message
        self.context = ctx
        super().__init__(message)


class NotFound(AppError):
    status_code = 404
    code = "not_found"

class Conflict(AppError):
    status_code = 409
    code = "conflict"

class BadRequest(AppError):
    status_code = 400
    code = "bad_request"

class Forbidden(AppError):
    status_code = 403
    code = "forbidden"

class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"


def install_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app(request: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code,
                            content={"error": exc.code, "detail": exc.message})

    @app.exception_handler(RequestValidationError)
    async def _val(request: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422,
                            content={"error": "validation_error",
                                     "detail": "Invalid request"})

    @app.exception_handler(IntegrityError)
    async def _int(request: Request, exc: IntegrityError):
        return JSONResponse(status_code=409,
                            content={"error": "conflict", "detail": "Data conflict"})

    @app.exception_handler(Exception)
    async def _u(request: Request, exc: Exception):
        log.exception("unhandled")
        return JSONResponse(status_code=500,
                            content={"error": "internal_error",
                                     "detail": "Internal server error"})
