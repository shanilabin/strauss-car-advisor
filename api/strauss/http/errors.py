"""One error shape for every failure: {"error": {"code", "message_he", "details"}}."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from strauss.adapters.supabase_rest import SupabaseError
from strauss.domain.compare import IncompleteProfile, UnknownOption
from strauss.errors import ApiError
from strauss.http.schemas import ErrorBody, ErrorResponse

__all__ = ["ERROR_RESPONSES", "ApiError", "install_error_handlers"]


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


logger = logging.getLogger("strauss.http")


async def _data_unavailable(request: Request, exc: Exception) -> JSONResponse:
    # The detail goes to the server log (Vercel function logs); the client gets a stable message.
    logger.error("data service failure on %s %s: %s", request.method, request.url.path, exc)
    return _respond(503, "data_unavailable", "שירות הנתונים לא זמין כרגע. נסו שוב בעוד רגע")


async def _incomplete_profile(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, IncompleteProfile)
    missing = [m.model_dump(mode="json") for m in exc.missing]
    return _respond(422, "incomplete_profile", "חסרים פרטים כדי לחשב את ההשוואה", {"missing": missing})


async def _unknown_option(_: Request, exc: Exception) -> JSONResponse:
    return _respond(404, "option_not_found", "חלק מהחלופות שנבחרו לא קיימות", {"option_ids": str(exc)})


_HTTP_MESSAGES = {404: "לא נמצא", 405: "פעולה לא נתמכת", 401: "נדרשת התחברות", 403: "אין הרשאה"}


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    message = _HTTP_MESSAGES.get(exc.status_code, "שגיאה")
    return _respond(exc.status_code, f"http_{exc.status_code}", message)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(SupabaseError, _data_unavailable)
    app.add_exception_handler(IncompleteProfile, _incomplete_profile)
    app.add_exception_handler(UnknownOption, _unknown_option)


# Documented on every route so the generated client knows the error shape
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {"model": ErrorResponse, "description": description}
    for status, description in {
        401: "Not authenticated",
        404: "Not found",
        409: "Conflict (stale revision, already answered)",
        422: "Invalid input",
        503: "Data service or chat model unavailable (details.mode = form)",
    }.items()
}
