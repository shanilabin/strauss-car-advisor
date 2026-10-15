"""An error with an HTTP status and a Hebrew message - raised by services, rendered by the HTTP layer."""

from typing import Any


class ApiError(Exception):
    def __init__(self, status: int, code: str, message_he: str, details: dict[str, Any] | None = None):
        super().__init__(message_he)
        self.status = status
        self.code = code
        self.message_he = message_he
        self.details = details
