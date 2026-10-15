"""Interfaces the core depends on. Implementations live in strauss.adapters."""

from dataclasses import dataclass
from typing import Any, Literal, Protocol

from strauss.domain.models import Comparison, Profile, Vehicle, VehicleKey

Role = Literal["employee", "rep"]


class ValueOfUseRepo(Protocol):
    """The Tax Authority value-of-use data, looked up by the official 5-field key only."""

    def get(self, key: VehicleKey) -> Vehicle | None:
        """Exactly one vehicle for the full key, or None. Never a partial-key guess."""
        ...

    def search(self, query: str, tax_year: int, reg_year: int | None, limit: int) -> list[Vehicle]:
        """Candidates whose commercial or maker name contains the query, each with its full key."""
        ...


@dataclass(frozen=True)
class AuthUser:
    id: str
    role: Role
    is_anonymous: bool


class AuthVerifier(Protocol):
    def verify(self, token: str) -> AuthUser | None:
        """The user behind a Supabase access token, or None if the token is invalid or expired."""
        ...


@dataclass(frozen=True)
class ConversationRecord:
    id: str
    user_id: str
    status: str
    profile: Profile


class ConversationRepo(Protocol):
    """Conversations and everything under them. The profile revision is the concurrency guard."""

    def create(self, user_id: str, profile: Profile, status: str, config_hash: str) -> ConversationRecord: ...

    def get(self, conversation_id: str) -> ConversationRecord | None: ...

    def update_profile(
        self, conversation_id: str, profile: Profile, status: str, expected_revision: int
    ) -> ConversationRecord | None:
        """Atomic compare-and-set on the revision. None if someone changed the profile meanwhile."""
        ...

    def set_status(self, conversation_id: str, status: str) -> None: ...

    def messages(self, conversation_id: str) -> list[dict[str, Any]]:
        """Rows: id, role, content, payload, created_at - oldest first."""
        ...

    def open_questions(self, conversation_id: str) -> list[dict[str, Any]]: ...

    def latest_comparison(self, conversation_id: str) -> Comparison | None: ...

    def save_comparison(
        self, conversation_id: str, request: dict[str, Any], comparison: Comparison
    ) -> None: ...
