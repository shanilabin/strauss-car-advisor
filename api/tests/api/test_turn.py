"""A conversation turn through the API (A4.2): the agent runs on the stored state with a scripted model,
and everything it did is saved - profile, comparisons, both messages with cards and trace."""

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.exceptions import ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, ToolCallPart, UserPromptPart

from index import app
from strauss.adapters.memory_repos import MemoryConversationRepo
from strauss.agent.guard import ID_MASK
from strauss.agent.models_chain import AgentUnavailable
from strauss.services import turn as turn_service
from strauss.services.turn import STUCK_REPLY
from tests.api.conftest import AS_NOA, AS_OTHER, ModelSlot
from tests.scripted import say, scripted

client = TestClient(app)


def start(sample: str | None = "E-001") -> str:
    body = {"sample_employee_id": sample} if sample else {}
    response = client.post("/v1/conversations", json=body, headers=AS_NOA)
    assert response.status_code == 201, response.text
    conversation_id: str = response.json()["id"]
    return conversation_id


def send(conversation_id: str, text: str) -> Any:
    return client.post(f"/v1/conversations/{conversation_id}/messages", json={"text": text}, headers=AS_NOA)


def prompts(messages: list[ModelMessage]) -> list[str]:
    return [
        str(part.content)
        for message in messages
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, UserPromptPart)
    ]


def test_noa_asks_about_the_electric_car_and_gets_the_engines_numbers(model: ModelSlot) -> None:
    conversation_id = start()
    model.factory = lambda: scripted(
        ("compare", {"option_ids": ["CAR-10"]}), say("הנטו שלך עולה במעבר ל-ATTO 3.", "מה עם ויתור?")
    )
    response = send(conversation_id, "כמה אקבל בנטו אם אעבור ל-ATTO 3?")
    assert response.status_code == 200, response.text
    body = response.json()
    (card,) = body["reply"]["cards"]  # ATTO 3's participation is a default: an estimate, nobody asked yet
    assert card["kind"] == "comparison" and card["comparison"]["results"][0]["delta"] == 661
    assert [e["kind"] for e in body["trace"]] == ["tool_call", "tool_result", "guard", "model"]

    state = body["state"]
    assert state["status"] == "PRESENTED"
    assert state["latest_comparison"]["id"] == card["comparison"]["id"]  # saved for audit
    user, bot = state["messages"]
    assert (user["role"], bot["role"]) == ("user", "assistant")
    assert bot["cards"] == body["reply"]["cards"] and bot["trace"] == body["trace"]

    reloaded = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert reloaded["messages"] == state["messages"]  # after a refresh, the same conversation


def test_what_the_agent_learns_is_saved_with_a_new_revision(model: ModelSlot) -> None:
    conversation_id = start(sample=None)
    model.factory = lambda: scripted(
        ("update_profile", {"occupation": "מנהל/ת מוצר", "base_salary": 18500}),
        say("תודה! כמה אחוז מהשכר יורד לפנסיה?"),
    )
    state = send(conversation_id, "אני מנהלת מוצר, מרוויחה 18,500").json()["state"]
    assert state["profile"]["occupation"] == "מנהל/ת מוצר" and state["profile"]["revision"] == 1
    assert state["status"] == "COLLECTING"
    assert "salary.base" not in {m["field"] for m in state["missing"]}


def test_the_model_gets_the_recent_conversation_and_a_masked_id(model: ModelSlot) -> None:
    conversation_id = start()
    seen: list[list[ModelMessage]] = []

    def capture(messages: list[ModelMessage]) -> ModelResponse:
        seen.append(messages)
        return ModelResponse(parts=[ToolCallPart("final_result", {"text": "בסדר"})])

    model.factory = lambda: scripted(say("שלום!"))
    send(conversation_id, "שלום")
    model.factory = lambda: scripted(capture)
    state = send(conversation_id, "תעודת הזהות שלי 123456789").json()["state"]

    assert prompts(seen[0]) == ["שלום", f"תעודת הזהות שלי {ID_MASK}"]
    assert state["messages"][2]["text"] == f"תעודת הזהות שלי {ID_MASK}"  # never stored either


def test_no_model_means_form_mode_and_nothing_is_saved(
    model: ModelSlot, conversations: MemoryConversationRepo
) -> None:
    conversation_id = start()

    def no_keys() -> Any:
        raise AgentUnavailable("no keys")

    model.factory = no_keys
    response = send(conversation_id, "שלום")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "agent_unavailable"
    assert response.json()["error"]["details"] == {"mode": "form"}
    assert conversations.messages(conversation_id) == []


def rate_limited(messages: list[ModelMessage]) -> ModelResponse:
    raise ModelHTTPError(429, "gemini-3.8-flash", "quota")


def test_a_provider_still_busy_after_one_retry_means_form_mode(
    model: ModelSlot, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(turn_service, "BUSY_WAIT_SECONDS", 0)
    conversation_id = start()
    model.factory = lambda: scripted(rate_limited, rate_limited)
    response = send(conversation_id, "שלום")
    assert response.status_code == 503 and response.json()["error"]["details"] == {"mode": "form"}


def test_a_provider_busy_for_a_moment_is_retried_once(
    model: ModelSlot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Free tiers limit per minute: one short wait often saves the turn instead of the form."""
    monkeypatch.setattr(turn_service, "BUSY_WAIT_SECONDS", 0)
    conversation_id = start()
    model.factory = lambda: scripted(rate_limited, say("שלום! במה אפשר לעזור?"))
    response = send(conversation_id, "שלום")
    assert response.status_code == 200 and response.json()["reply"]["text"] == "שלום! במה אפשר לעזור?"


def test_a_profile_corrected_meanwhile_is_not_overwritten(
    model: ModelSlot, conversations: MemoryConversationRepo
) -> None:
    conversation_id = start()

    def corrected_in_another_tab(messages: list[ModelMessage]) -> ModelResponse:
        response = client.patch(
            f"/v1/conversations/{conversation_id}/profile", json={"children_under_23": 3}, headers=AS_NOA
        )
        assert response.status_code == 200
        return ModelResponse(parts=[ToolCallPart("update_profile", {"children_under_23": 1})])

    model.factory = lambda: scripted(corrected_in_another_tab, say("עודכן"))
    response = send(conversation_id, "יש לי ילד אחד")
    assert response.status_code == 409 and response.json()["error"]["code"] == "stale_revision"
    record = conversations.get(conversation_id)
    assert record is not None and record.profile.children_under_23 == 3
    assert conversations.messages(conversation_id) == []


def test_someone_elses_conversation_is_not_found_before_any_model_runs(model: ModelSlot) -> None:
    conversation_id = start()
    response = client.post(
        f"/v1/conversations/{conversation_id}/messages", json={"text": "שלום"}, headers=AS_OTHER
    )
    assert response.status_code == 404
    assert model.calls == 0


def test_a_rep_question_is_opened_once_and_the_conversation_waits_for_the_rep(
    model: ModelSlot, conversations: MemoryConversationRepo
) -> None:
    conversation_id = start()
    model.factory = lambda: scripted(
        ("compare", {"option_ids": ["CAR-10"]}),
        ("ask_representative", {"field": "participation:CAR-10"}),
        say("שאלתי את נציג התחבורה על ההשתתפות."),
    )
    body = send(conversation_id, "מה עם ATTO 3?").json()
    assert [c["kind"] for c in body["reply"]["cards"]] == ["comparison", "rep_pending"]
    (question,) = body["state"]["open_questions"]
    assert question["field"] == "participation:CAR-10" and "ATTO 3" in question["question"]
    assert body["state"]["status"] == "WAITING_REP"

    model.factory = lambda: scripted(
        ("ask_representative", {"field": "participation:CAR-10"}), say("כבר שאלתי, מחכים לתשובה.")
    )
    again = send(conversation_id, "תשאל שוב").json()
    assert len(again["state"]["open_questions"]) == 1  # one open question per field


def test_a_model_that_gets_stuck_still_answers_and_keeps_what_it_learned(model: ModelSlot) -> None:
    conversation_id = start(sample=None)
    model.factory = lambda: scripted(
        ("update_profile", {"occupation": "מנהל/ת מוצר"}),
        ("ask_representative", {"field": "salary"}),
        ("ask_representative", {"field": "salary"}),
        ("ask_representative", {"field": "salary"}),
    )
    response = send(conversation_id, "אני מנהלת מוצר")
    assert response.status_code == 200
    body = response.json()
    assert body["reply"]["text"] == STUCK_REPLY
    assert body["state"]["profile"]["occupation"] == "מנהל/ת מוצר"
    assert body["trace"][-1]["name"] == "stuck"


def test_a_change_told_in_the_chat_after_a_comparison_recomputes_it(model: ModelSlot) -> None:
    conversation_id = start("E-006")  # Eli; a recalculation never asks the rep again
    shown = client.post(
        f"/v1/conversations/{conversation_id}/compare", json={"option_ids": ["CAR-14"]}, headers=AS_NOA
    ).json()
    model.factory = lambda: scripted(
        ("update_profile", {"children_under_23": 0}), say("עדכנתי וחישבתי מחדש.", "למה הנטו משתנה?")
    )
    body = send(conversation_id, "אין לי ילדים מתחת לגיל 23").json()
    (card,) = body["reply"]["cards"]
    assert card["kind"] == "comparison"
    assert [r["option"]["id"] for r in card["comparison"]["results"]] == ["CAR-14"]
    state = body["state"]
    assert state["latest_comparison"]["id"] == card["comparison"]["id"] != shown["id"]
    assert state["latest_comparison"]["profile_snapshot"]["revision"] == state["profile"]["revision"]
    assert state["status"] == "PRESENTED"


def test_stuck_after_a_calculation_says_the_result_is_on_screen(model: ModelSlot) -> None:
    """QA B02: "I could not complete it" next to a comparison that was completed."""
    conversation_id = start()
    calls = [("compare", {"option_ids": ["waiver"]})] * 13  # past the request limit
    model.factory = lambda: scripted(*calls)
    body = send(conversation_id, "מה אם אוותר על הרכב?").json()
    assert body["reply"]["text"] == turn_service.STUCK_AFTER_RESULT
    assert [c["kind"] for c in body["reply"]["cards"]] == ["comparison"]  # one, not thirteen


def test_a_missing_card_says_what_is_missing_at_the_end_of_the_turn(model: ModelSlot) -> None:
    """QA B06: compared before saving the car, then saved it - no question about the car is left."""
    conversation_id = start(sample=None)
    model.factory = lambda: scripted(
        ("compare", {"option_ids": ["CAR-10"]}),  # nothing known yet -> a "missing" card
        ("update_profile", {"occupation": "מנהל/ת מוצר", "base_salary": 18500}),
        say("שמרתי. מה אחוז הפנסיה שלך?"),
    )
    body = send(conversation_id, "אני מנהלת מוצר ומרוויחה 18500").json()
    (card,) = body["reply"]["cards"]
    assert card["kind"] == "missing"
    fields = [m["field"] for m in card["missing"]]
    assert "occupation" not in fields and "salary.base" not in fields and "current" in fields


def test_a_slow_busy_answer_is_not_retried(model: ModelSlot, monkeypatch: pytest.MonkeyPatch) -> None:
    """Providers that time out already took long: one more round would outlast the browser's request.
    The same script that a quick "busy" saves (see above) now ends in form mode."""
    monkeypatch.setattr(turn_service, "BUSY_WAIT_SECONDS", 0)
    monkeypatch.setattr(turn_service, "RETRY_ONLY_WITHIN_SECONDS", -1)  # every failure counts as slow
    conversation_id = start()
    model.factory = lambda: scripted(rate_limited, say("שלום! במה אפשר לעזור?"))
    response = send(conversation_id, "שלום")
    assert response.status_code == 503 and response.json()["error"]["details"]["mode"] == "form"


def test_a_chain_that_runs_out_of_time_answers_form_mode(
    model: ModelSlot, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A model that hangs (times every model in the chain) must not keep the browser waiting for minutes."""
    monkeypatch.setattr(turn_service, "TURN_DEADLINE_SECONDS", 0.2)
    conversation_id = start()

    def hangs(_messages: Any) -> Any:
        time.sleep(1)
        return say("מאוחר מדי")

    model.factory = lambda: scripted(hangs)
    response = send(conversation_id, "שלום")
    assert response.status_code == 503 and response.json()["error"]["details"]["mode"] == "form"


def test_a_car_details_card_is_saved_and_read_back_with_the_conversation(model: ModelSlot) -> None:
    """Testers' "message failed": the vehicle facts card was saved in snake_case and could not be read back
    (its config models read camelCase only) - every later message of that conversation answered 500."""
    conversation_id = start()
    model.factory = lambda: scripted(("car_details", {"cars": ["kona ev"]}), say("הפרטים בכרטיס."))
    first = send(conversation_id, "כמה מקומות יש בקונה?")
    assert first.status_code == 200
    (card,) = first.json()["reply"]["cards"]
    assert card["kind"] == "vehicle_facts" and card["source"]["fetched_on"]
    model.factory = lambda: scripted(say("בשמחה."))
    assert send(conversation_id, "ומה עוד?").status_code == 200
    again = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA)
    assert again.status_code == 200
    cards = [c for m in again.json()["messages"] for c in m.get("cards") or []]
    saved = [c for c in cards if c["kind"] == "vehicle_facts"]
    assert saved and saved[0]["cars"][0]["facts"]["seats"] == 5
