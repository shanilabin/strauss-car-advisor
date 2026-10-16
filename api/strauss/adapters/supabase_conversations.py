"""ConversationRepo backed by Supabase (secret key, server-side only - ownership is checked by the API)."""

from typing import Any

import httpx

from strauss.adapters.supabase_rest import raise_for_status
from strauss.domain.models import Comparison, Profile
from strauss.ports.repositories import ConversationRecord

RETURN_ROW = {"Prefer": "return=representation"}
UNIQUE_VIOLATION = 409  # PostgREST maps Postgres 23505 to 409 Conflict


def _record(row: dict[str, Any]) -> ConversationRecord:
    profile = Profile.model_validate(row["profile"]).model_copy(update={"revision": row["profile_revision"]})
    return ConversationRecord(id=row["id"], user_id=row["user_id"], status=row["status"], profile=profile)


def _profile_json(profile: Profile) -> dict[str, Any]:
    data: dict[str, Any] = profile.model_dump(mode="json", exclude={"revision"})
    return data


class SupabaseConversationRepo:
    def __init__(self, client: httpx.Client) -> None:
        self._client = client

    def create(self, user_id: str, profile: Profile, status: str, config_hash: str) -> ConversationRecord:
        response = self._client.post(
            "/conversations",
            json={
                "user_id": user_id,
                "status": status,
                "profile": _profile_json(profile),
                "profile_revision": profile.revision,
                "config_hash": config_hash,
            },
            headers=RETURN_ROW,
        )
        raise_for_status(response)
        return _record(response.json()[0])

    def get(self, conversation_id: str) -> ConversationRecord | None:
        response = self._client.get("/conversations", params={"id": f"eq.{conversation_id}", "select": "*"})
        raise_for_status(response)
        rows = response.json()
        return _record(rows[0]) if rows else None

    def update_profile(
        self, conversation_id: str, profile: Profile, status: str, expected_revision: int
    ) -> ConversationRecord | None:
        # Compare-and-set: the row only matches if nobody bumped the revision since it was read.
        response = self._client.patch(
            "/conversations",
            params={"id": f"eq.{conversation_id}", "profile_revision": f"eq.{expected_revision}"},
            json={"profile": _profile_json(profile), "profile_revision": profile.revision, "status": status},
            headers=RETURN_ROW,
        )
        raise_for_status(response)
        rows = response.json()
        return _record(rows[0]) if rows else None

    def set_status(self, conversation_id: str, status: str) -> None:
        response = self._client.patch(
            "/conversations", params={"id": f"eq.{conversation_id}"}, json={"status": status}
        )
        raise_for_status(response)

    def messages(self, conversation_id: str) -> list[dict[str, Any]]:
        response = self._client.get(
            "/messages",
            params={"conversation_id": f"eq.{conversation_id}", "select": "*", "order": "created_at.asc"},
        )
        raise_for_status(response)
        rows: list[dict[str, Any]] = response.json()
        return rows

    def add_messages(self, conversation_id: str, rows: list[dict[str, Any]]) -> None:
        # One request for the turn's messages; created_at comes from the API so their order is explicit.
        response = self._client.post(
            "/messages", json=[{**row, "conversation_id": conversation_id} for row in rows]
        )
        raise_for_status(response)

    def open_questions(self, conversation_id: str) -> list[dict[str, Any]]:
        response = self._client.get(
            "/rep_questions",
            params={"conversation_id": f"eq.{conversation_id}", "status": "eq.OPEN", "select": "*"},
        )
        raise_for_status(response)
        rows: list[dict[str, Any]] = response.json()
        return rows

    def open_question(
        self, conversation_id: str, field: str, question: str, context: dict[str, str], profile_revision: int
    ) -> dict[str, Any] | None:
        response = self._client.post(
            "/rep_questions",
            json={
                "conversation_id": conversation_id,
                "field": field,
                "question": question,
                "context": context,
                "profile_revision": profile_revision,
            },
            headers=RETURN_ROW,
        )
        if response.status_code == UNIQUE_VIOLATION:  # rep_questions_one_open_per_field
            return None
        raise_for_status(response)
        row: dict[str, Any] = response.json()[0]
        return row

    def latest_comparison(self, conversation_id: str) -> Comparison | None:
        response = self._client.get(
            "/comparisons",
            params={
                "conversation_id": f"eq.{conversation_id}",
                "select": "result",
                "order": "created_at.desc",
                "limit": "1",
            },
        )
        raise_for_status(response)
        rows = response.json()
        return Comparison.model_validate(rows[0]["result"]) if rows else None

    def save_comparison(self, conversation_id: str, request: dict[str, Any], comparison: Comparison) -> None:
        context = comparison.context
        response = self._client.post(
            "/comparisons",
            json={
                "id": comparison.id,
                "conversation_id": conversation_id,
                "input": request,
                "result": comparison.model_dump(mode="json"),
                "config_version": context.config_version,
                "config_hash": context.config_hash,
                "engine_version": context.engine_version,
                "payroll_tax_year": context.payroll_tax_year,
                "value_of_use_tax_year": context.value_of_use_tax_year,
            },
        )
        raise_for_status(response)
