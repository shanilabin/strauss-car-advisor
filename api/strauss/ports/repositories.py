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
    first_name: str | None = None  # from the sign-in account (Google's given name) - for a personal chat


@dataclass(frozen=True)
class ConversationSummary:
    """One line of "my conversations"."""

    id: str
    status: str
    profile: Profile
    created_at: str
    updated_at: str


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

    def list_for_user(self, user_id: str, limit: int) -> list[ConversationSummary]:
        """The user's conversations, the most recently active first."""
        ...

    def update_profile(
        self, conversation_id: str, profile: Profile, status: str, expected_revision: int
    ) -> ConversationRecord | None:
        """Atomic compare-and-set on the revision. None if someone changed the profile meanwhile."""
        ...

    def set_status(self, conversation_id: str, status: str) -> None: ...

    def messages(self, conversation_id: str) -> list[dict[str, Any]]:
        """Rows: id, role, content, payload, created_at - oldest first."""
        ...

    def add_messages(self, conversation_id: str, rows: list[dict[str, Any]]) -> None:
        """Rows: role, content, payload, created_at - written together, in order."""
        ...

    def open_questions(self, conversation_id: str) -> list[dict[str, Any]]: ...

    def open_question(
        self, conversation_id: str, field: str, question: str, context: dict[str, str], profile_revision: int
    ) -> dict[str, Any] | None:
        """Opens a rep question. None if one is already open for this field (one open question per field)."""
        ...

    def get_question(self, question_id: str) -> dict[str, Any] | None: ...

    def list_questions(self, status: str | None) -> list[dict[str, Any]]:
        """The rep's queue across every conversation, newest first."""
        ...

    def answer_question(
        self, question_id: str, answer: dict[str, Any], answered_by: str
    ) -> dict[str, Any] | None:
        """Atomic OPEN -> ANSWERED. None if it was already answered (only the first answer wins)."""
        ...

    def latest_comparison(self, conversation_id: str) -> Comparison | None: ...

    def save_comparison(
        self, conversation_id: str, request: dict[str, Any], comparison: Comparison
    ) -> None: ...
