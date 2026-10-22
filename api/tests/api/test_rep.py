"""The transport rep flow (A4.4) - the challenge's own script: a participation is missing -> the bot asks
the rep -> the rep answers 350 -> the employee's comparison updates. Plus the safety rails: one answer only,
answers are validated, an answer that no longer fits is kept but not applied, and the rep sees no salary."""

import json
import uuid
from typing import Any

from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelResponse, ToolCallPart

from index import app
from strauss.adapters.memory_repos import MemoryConversationRepo
from tests.api.conftest import AS_NOA, AS_REP, ModelSlot
from tests.scripted import say, scripted

client = TestClient(app)


def start(sample: str = "E-001") -> str:
    response = client.post("/v1/conversations", json={"sample_employee_id": sample}, headers=AS_NOA)
    assert response.status_code == 201, response.text
    conversation_id: str = response.json()["id"]
    return conversation_id


def ask_about_atto(model: ModelSlot) -> tuple[str, dict[str, Any]]:
    """Noa asks about ATTO 3; its participation is the catalog default, so the bot asks the rep."""
    conversation_id = start()
    model.factory = lambda: scripted(
        ("compare", {"option_ids": ["CAR-10"]}),
        ("ask_representative", {"field": "participation:CAR-10"}),
        say("הנטו שלך עולה, אבל ההשתתפות היא הערכה. שאלתי את נציג התחבורה."),
    )
    body = client.post(
        f"/v1/conversations/{conversation_id}/messages", json={"text": "מה עם ATTO 3?"}, headers=AS_NOA
    ).json()
    (question,) = body["state"]["open_questions"]
    return conversation_id, question


def answer(question_id: str, value: str) -> Any:
    return client.post(f"/v1/rep/questions/{question_id}/answer", json={"value": value}, headers=AS_REP)


def test_the_challenge_script_missing_participation_asked_answered_350_comparison_updated(
    model: ModelSlot,
) -> None:
    conversation_id, question = ask_about_atto(model)

    queue = client.get("/v1/rep/questions?status=OPEN", headers=AS_REP).json()
    assert [q["id"] for q in queue] == [question["id"]]
    assert queue[0]["context"]["requested_car"] == "ATTO 3 (2025)"

    response = answer(question["id"], "350")
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "ANSWERED" and response.json()["answer"]["value"] == "350"

    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert state["open_questions"] == [] and state["status"] == "PRESENTED"
    assert state["profile"]["confirmed_participation"] == {"CAR-10": 350}
    event, bot = state["messages"][-2:]
    assert event["role"] == "system_event" and "ATTO 3" in event["text"]
    (card,) = bot["cards"]
    (atto,) = card["comparison"]["results"]
    assert (atto["participation"], atto["participation_status"]) == (350, "CONFIRMED")
    assert state["latest_comparison"]["id"] == card["comparison"]["id"]


def test_a_second_answer_is_refused_and_changes_nothing(model: ModelSlot) -> None:
    conversation_id, question = ask_about_atto(model)
    assert answer(question["id"], "350").status_code == 200
    second = answer(question["id"], "400")
    assert second.status_code == 409 and second.json()["error"]["code"] == "already_answered"
    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert state["profile"]["confirmed_participation"] == {"CAR-10": 350}
    assert [m["role"] for m in state["messages"]].count("system_event") == 1  # resumed once


def test_an_answer_that_is_not_an_amount_is_refused_before_anything_is_written(model: ModelSlot) -> None:
    _, question = ask_about_atto(model)
    response = answer(question["id"], "בערך שלוש מאות")
    assert response.status_code == 422 and response.json()["error"]["code"] == "invalid_answer"
    assert len(client.get("/v1/rep/questions?status=OPEN", headers=AS_REP).json()) == 1  # still open
    assert answer(question["id"], "1,200 ₪").status_code == 200


def test_an_unlisted_occupation_is_confirmed_by_the_rep(model: ModelSlot) -> None:
    conversation_id = start()
    model.factory = lambda: scripted(
        ("update_profile", {"occupation": "אסטרונאוט/ית", "occupation_not_in_list": True}),
        ("ask_representative", {"field": "occupation"}),
        say("העיסוק לא בטבלה, שאלתי את נציג התחבורה."),
    )
    client.post(
        f"/v1/conversations/{conversation_id}/messages", json={"text": "אני אסטרונאוטית"}, headers=AS_NOA
    )
    (question,) = client.get("/v1/rep/questions?status=OPEN", headers=AS_REP).json()
    assert answer(question["id"], "אסטרונאוט").status_code == 422  # must be a name from the table
    assert answer(question["id"], "מנהל/ת מוצר").status_code == 200
    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert state["profile"]["occupation"] == "מנהל/ת מוצר"
    assert state["messages"][-1]["cards"][0]["kind"] == "options"


def test_an_answer_about_something_the_employee_changed_meanwhile_is_kept_but_not_applied(
    model: ModelSlot, conversations: MemoryConversationRepo
) -> None:
    conversation_id = start()
    model.factory = lambda: scripted(
        ("update_profile", {"occupation": "אסטרונאוט/ית", "occupation_not_in_list": True}),
        ("ask_representative", {"field": "occupation"}),
        say("שאלתי את נציג התחבורה."),
    )
    client.post(f"/v1/conversations/{conversation_id}/messages", json={"text": "אסטרונאוטית"}, headers=AS_NOA)
    client.patch(
        f"/v1/conversations/{conversation_id}/profile", json={"occupation": "מפתח/ת תוכנה"}, headers=AS_NOA
    )
    (question,) = client.get("/v1/rep/questions?status=OPEN", headers=AS_REP).json()
    assert answer(question["id"], "מנהל/ת מוצר").status_code == 200
    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert state["profile"]["occupation"] == "מפתח/ת תוכנה"  # the employee's correction stands
    assert state["messages"][-1]["role"] == "system_event" and "לא הוחלה" in state["messages"][-1]["text"]


def test_the_rep_sees_no_salary_and_no_chat(model: ModelSlot) -> None:
    ask_about_atto(model)
    queue = json.dumps(client.get("/v1/rep/questions", headers=AS_REP).json(), ensure_ascii=False)
    assert "18500" not in queue and "salary" not in queue and "messages" not in queue


def test_unknown_or_malformed_question_ids_are_not_found() -> None:
    assert answer(str(uuid.uuid4()), "350").status_code == 404
    assert answer("not-a-uuid", "350").status_code == 404


def test_employees_cannot_answer() -> None:
    response = client.post(f"/v1/rep/questions/{uuid.uuid4()}/answer", json={"value": "1"}, headers=AS_NOA)
    assert response.status_code == 403


def test_an_answer_recorded_but_not_applied_is_finished_by_the_retry(
    model: ModelSlot, conversations: MemoryConversationRepo
) -> None:
    """The connection dropped after OPEN -> ANSWERED: the rep clicks again, still gets 409 (the first answer
    won), and the first answer is applied now instead of being lost."""
    conversation_id, question = ask_about_atto(model)
    conversations.answer_question(question["id"], {"value": "350", "effective_from": None}, "rep")
    retry = answer(question["id"], "400")
    assert retry.status_code == 409
    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert state["profile"]["confirmed_participation"] == {"CAR-10": 350}  # the first answer, applied once
    assert answer(question["id"], "400").status_code == 409
    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert [m["role"] for m in state["messages"]].count("system_event") == 1


def test_a_rep_answer_during_the_employees_turn_is_merged_not_a_conflict(model: ModelSlot) -> None:
    conversation_id, question = ask_about_atto(model)

    def rep_answers_meanwhile(messages: Any) -> Any:
        assert answer(question["id"], "350").status_code == 200
        return ModelResponse(parts=[ToolCallPart("update_profile", {"children_under_23": 3})])

    model.factory = lambda: scripted(rep_answers_meanwhile, say("עדכנתי את מספר הילדים."))
    response = client.post(
        f"/v1/conversations/{conversation_id}/messages", json={"text": "יש לי 3 ילדים"}, headers=AS_NOA
    )
    assert response.status_code == 200, response.text
    profile = response.json()["state"]["profile"]
    assert profile["children_under_23"] == 3 and profile["confirmed_participation"] == {"CAR-10": 350}


def test_a_car_the_rep_already_confirmed_is_never_asked_about_again(
    conversations: MemoryConversationRepo,
) -> None:
    """Reviewer's question: once the rep confirmed the ATTO 3's participation, comparing it again - in the
    gallery or in the chat - opens no new question."""
    conversation_id = client.post(
        "/v1/conversations", json={"sample_employee_id": "E-001"}, headers=AS_NOA
    ).json()["id"]
    url = f"/v1/conversations/{conversation_id}/compare"
    client.post(url, json={"option_ids": ["CAR-10"]}, headers=AS_NOA)
    (question,) = conversations.open_questions(conversation_id)
    assert answer(question["id"], "350").status_code == 200
    again = client.post(url, json={"option_ids": ["CAR-10"]}, headers=AS_NOA).json()
    assert conversations.open_questions(conversation_id) == []
    (atto,) = again["results"]
    assert atto["participation"] == 350 and atto["participation_status"] == "CONFIRMED"
