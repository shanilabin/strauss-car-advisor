"""SupabaseConversationRepo against a simulated PostgREST - no network, no keys."""

from typing import Any

import httpx

from strauss.adapters.supabase_conversations import SupabaseConversationRepo
from strauss.adapters.supabase_rest import rest_client

ROW = {
    "id": "c-1", "status": "COLLECTING", "profile": {}, "profile_revision": 3,
    "created_at": "2026-10-23T09:00:00+00:00", "updated_at": "2026-10-23T09:05:00+00:00",
    "messages": [{"content": "אני שוקלת לעבור לרכב חשמלי"}],
}  # fmt: skip


def repo_answering(rows: list[dict[str, Any]], seen: list[httpx.Request]) -> SupabaseConversationRepo:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=rows)

    client = rest_client("https://abcdefghijklmnopqrst.supabase.co", "sb_secret_test",
                         transport=httpx.MockTransport(handler))  # fmt: skip
    return SupabaseConversationRepo(client)


def test_my_conversations_ask_only_for_ones_with_a_message_of_the_employee() -> None:
    seen: list[httpx.Request] = []
    (summary,) = repo_answering([ROW], seen).list_for_user("u-1", 30)
    params = seen[0].url.params
    assert params["user_id"] == "eq.u-1"
    assert "messages!inner(content)" in params["select"]  # an inner join: no message, no row
    assert (params["messages.role"], params["messages.order"], params["messages.limit"]) == (
        "eq.user",
        "created_at.asc",
        "1",
    )
    assert summary.first_message == "אני שוקלת לעבור לרכב חשמלי" and summary.profile.revision == 3
