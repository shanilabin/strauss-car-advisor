"""One error shape for every failure: {"error": {"code", "message_he", "details"}}."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from strauss.http.schemas import ErrorBody, ErrorResponse


class ApiError(Exception):
    def __init__(self, status: int, code: str, message_he: str, details: dict[str, Any] | None = None):
        super().__init__(message_he)
        self.status = status
        self.code = code
        self.message_he = message_he
        self.details = details


def _respond(status: int, code: str, message_he: str, details: dict[str, Any] | None = None) -> JSONResponse:
    body = ErrorResponse(error=ErrorBody(code=code, message_he=message_he, details=details))
    return JSONResponse(status_code=status, content=body.model_dump(mode="json"))


async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)
    return _respond(exc.status, exc.code, exc.message_he, exc.details)


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    fields = [
        {"loc": [str(part) for part in err["loc"]], "type": err["type"], "msg": err["msg"]}
        for err in exc.errors()
    ]
    return _respond(422, "invalid_input", "חלק מהנתונים שנשלחו לא תקינים", {"fields": fields})


_HTTP_MESSAGES = {404: "לא נמצא", 405: "פעולה לא נתמכת", 401: "נדרשת התחברות", 403: "אין הרשאה"}


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    message = _HTTP_MESSAGES.get(exc.status_code, "שגיאה")
    return _respond(exc.status_code, f"http_{exc.status_code}", message)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)


# Documented on every route so the generated client knows the error shape
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {"model": ErrorResponse, "description": description}
    for status, description in {
        401: "Not authenticated",
        404: "Not found",
        409: "Conflict (stale revision, already answered)",
        422: "Invalid input",
    }.items()
}
