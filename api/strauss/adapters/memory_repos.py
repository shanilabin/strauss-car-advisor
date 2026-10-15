"""In-memory ConversationRepo and AuthVerifier - for tests and local runs without Supabase.

They implement the same ports, with the same compare-and-set semantics, so the API behaves identically.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from strauss.domain.models import Comparison, Profile
from strauss.ports.repositories import AuthUser, ConversationRecord


class MemoryConversationRepo:
    def __init__(self) -> None:
        self.conversations: dict[str, ConversationRecord] = {}
        self.message_rows: dict[str, list[dict[str, Any]]] = {}
        self.question_rows: dict[str, list[dict[str, Any]]] = {}
        self.comparisons: dict[str, list[tuple[dict[str, Any], Comparison]]] = {}

    def create(self, user_id: str, profile: Profile, status: str, config_hash: str) -> ConversationRecord:
        record = ConversationRecord(id=str(uuid.uuid4()), user_id=user_id, status=status, profile=profile)
        self.conversations[record.id] = record
        return record

    def get(self, conversation_id: str) -> ConversationRecord | None:
        return self.conversations.get(conversation_id)

    def update_profile(
        self, conversation_id: str, profile: Profile, status: str, expected_revision: int
    ) -> ConversationRecord | None:
        current = self.conversations.get(conversation_id)
        if current is None or current.profile.revision != expected_revision:
            return None
        updated = ConversationRecord(id=current.id, user_id=current.user_id, status=status, profile=profile)
        self.conversations[conversation_id] = updated
        return updated

    def set_status(self, conversation_id: str, status: str) -> None:
        current = self.conversations[conversation_id]
        self.conversations[conversation_id] = ConversationRecord(
            id=current.id, user_id=current.user_id, status=status, profile=current.profile
        )

    def messages(self, conversation_id: str) -> list[dict[str, Any]]:
        return list(self.message_rows.get(conversation_id, []))

    def add_message(self, conversation_id: str, role: str, content: str, payload: dict[str, Any]) -> None:
        row = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "payload": payload,
            "created_at": datetime.now(UTC).isoformat(),
        }
        self.message_rows.setdefault(conversation_id, []).append(row)

    def open_questions(self, conversation_id: str) -> list[dict[str, Any]]:
        return [q for q in self.question_rows.get(conversation_id, []) if q["status"] == "OPEN"]

    def latest_comparison(self, conversation_id: str) -> Comparison | None:
        saved = self.comparisons.get(conversation_id)
        return saved[-1][1] if saved else None

    def save_comparison(self, conversation_id: str, request: dict[str, Any], comparison: Comparison) -> None:
        self.comparisons.setdefault(conversation_id, []).append((request, comparison))


class StaticAuthVerifier:
    """Tokens mapped to users up front."""

    def __init__(self, users: dict[str, AuthUser]) -> None:
        self._users = users

    def verify(self, token: str) -> AuthUser | None:
        return self._users.get(token)
