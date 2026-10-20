"""Conversation endpoints for real (A3.4): sign-in, ownership, profile corrections with revisions,
options and comparisons from the engine - stored and reloaded."""

from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient

from index import app
from strauss.adapters.memory_repos import MemoryConversationRepo
from tests.api.conftest import AS_NOA, AS_OTHER, AS_REP

client = TestClient(app)


def start(sample: str | None = "E-001", headers: dict[str, str] = AS_NOA) -> dict[str, Any]:
    body = {"sample_employee_id": sample} if sample else {}
    response = client.post("/v1/conversations", json=body, headers=headers)
    assert response.status_code == 201, response.text
    state: dict[str, Any] = response.json()
    return state


# ── Sign-in and ownership ────────────────────────────────────────────────────


def test_every_conversation_endpoint_requires_sign_in() -> None:
    conversation_id = start()["id"]
    calls = [
        ("post", "/v1/conversations", {}),
        ("get", f"/v1/conversations/{conversation_id}", None),
        ("patch", f"/v1/conversations/{conversation_id}/profile", {"children_under_23": 1}),
        ("get", f"/v1/conversations/{conversation_id}/options", None),
        ("post", f"/v1/conversations/{conversation_id}/compare", {"option_ids": ["CAR-10"]}),
        ("post", f"/v1/conversations/{conversation_id}/messages", {"text": "שלום"}),
    ]
    for method, path, body in calls:
        response = client.request(method, path, json=body)
        assert response.status_code == 401, path
        assert response.json()["error"]["code"] == "not_authenticated"


def test_an_invalid_token_is_refused() -> None:
    response = client.get("/v1/conversations/anything", headers={"Authorization": "Bearer forged"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_token"


def test_another_employees_conversation_does_not_exist_for_you() -> None:
    conversation_id = start()["id"]
    for method, path in [
        ("get", f"/v1/conversations/{conversation_id}"),
        ("get", f"/v1/conversations/{conversation_id}/options"),
    ]:
        response = client.request(method, path, headers=AS_OTHER)
        assert response.status_code == 404  # not 403: existence isn't revealed
        assert response.json()["error"]["code"] == "conversation_not_found"
    patched = client.patch(
        f"/v1/conversations/{conversation_id}/profile", json={"group": "ד"}, headers=AS_OTHER
    )
    assert patched.status_code == 404


def test_a_rep_cannot_open_an_employees_conversation() -> None:
    conversation_id = start()["id"]
    assert client.get(f"/v1/conversations/{conversation_id}", headers=AS_REP).status_code == 404


def test_rep_endpoints_are_for_reps_only() -> None:
    assert client.get("/v1/rep/questions", headers=AS_NOA).status_code == 403
    assert client.get("/v1/rep/questions").status_code == 401
    assert client.get("/v1/rep/questions", headers=AS_REP).status_code == 200


# ── Creating and reloading ───────────────────────────────────────────────────


def test_a_new_conversation_starts_collecting() -> None:
    state = start(sample=None)
    assert state["status"] == "COLLECTING"
    assert [m["field"] for m in state["missing"]] == ["occupation", "salary.base", "deductions", "current"]


def test_a_sample_employee_starts_ready_and_reloads_identically() -> None:
    created = start("E-003")
    assert created["status"] == "READY" and created["missing"] == []
    assert created["profile"]["current"] == {"kind": "waiver", "maintenance": 1500.0}
    reloaded = client.get(f"/v1/conversations/{created['id']}", headers=AS_NOA).json()
    assert reloaded == created  # survives a refresh


def test_unknown_sample_employee_is_404_in_hebrew() -> None:
    response = client.post("/v1/conversations", json={"sample_employee_id": "E-999"}, headers=AS_NOA)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "sample_employee_not_found"


# ── Options and comparisons from the engine ──────────────────────────────────


def test_options_are_the_engines_and_are_saved(conversations: MemoryConversationRepo) -> None:
    conversation_id = start()["id"]
    options = client.get(f"/v1/conversations/{conversation_id}/options", headers=AS_NOA).json()
    atto = next(r for r in options["results"] if r["option"]["id"] == "CAR-10")
    assert (atto["net_today"], atto["net_option"], atto["delta"]) == (11032, 11693, 661)
    assert options["best_option_id"] == "waiver"
    state = client.get(f"/v1/conversations/{conversation_id}", headers=AS_NOA).json()
    assert state["status"] == "PRESENTED"
    assert state["latest_comparison"]["id"] == options["id"]
    request, _ = conversations.comparisons[conversation_id][0]
    assert request == {"option_ids": None, "revision": 0}  # audit: what was asked, on which profile


def test_compare_selected_options() -> None:
    conversation_id = start("E-006")["id"]
    body = client.post(
        f"/v1/conversations/{conversation_id}/compare", json={"option_ids": ["CAR-14"]}, headers=AS_NOA
    ).json()
    (tesla,) = body["results"]
    assert tesla["delta"] == 721  # Eli, reference sheet


def test_options_on_an_incomplete_profile_say_what_to_ask() -> None:
    conversation_id = start(sample=None)["id"]
    response = client.get(f"/v1/conversations/{conversation_id}/options", headers=AS_NOA)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "incomplete_profile"


def test_unknown_option_is_404() -> None:
    conversation_id = start()["id"]
    response = client.post(
        f"/v1/conversations/{conversation_id}/compare", json={"option_ids": ["CAR-99"]}, headers=AS_NOA
    )
    assert response.status_code == 404


# ── Correcting the profile ───────────────────────────────────────────────────


def test_a_correction_bumps_the_revision_and_changes_the_numbers() -> None:
    conversation_id = start()["id"]
    patched = client.patch(
        f"/v1/conversations/{conversation_id}/profile",
        json={"expected_revision": 0, "salary": {"base": 20000}},
        headers=AS_NOA,
    ).json()
    assert patched["profile"]["revision"] == 1
    options = client.get(f"/v1/conversations/{conversation_id}/options", headers=AS_NOA).json()
    atto = next(r for r in options["results"] if r["option"]["id"] == "CAR-10")
    assert atto["net_today"] != 11032


def test_a_stale_correction_is_rejected() -> None:
    conversation_id = start()["id"]
    url = f"/v1/conversations/{conversation_id}/profile"
    assert (
        client.patch(url, json={"expected_revision": 0, "children_under_23": 3}, headers=AS_NOA).status_code
        == 200
    )
    stale = client.patch(url, json={"expected_revision": 0, "children_under_23": 4}, headers=AS_NOA)
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_revision"


def test_null_in_a_correction_never_erases_data() -> None:
    conversation_id = start()["id"]
    profile = client.patch(
        f"/v1/conversations/{conversation_id}/profile", json={"salary": None}, headers=AS_NOA
    ).json()["profile"]
    assert profile["salary"]["base"] == 18500


def test_todays_car_is_reread_from_the_tax_authority_data() -> None:
    state = start()
    current = state["profile"]["current"]
    current["vehicle"]["value_of_use"] = 1  # the client claims a tiny value of use
    patched = client.patch(
        f"/v1/conversations/{state['id']}/profile", json={"current": current}, headers=AS_NOA
    ).json()
    assert patched["profile"]["current"]["vehicle"]["value_of_use"] == 4070


def test_rep_confirmations_cannot_be_sent_by_the_employee() -> None:
    conversation_id = start()["id"]
    response = client.patch(
        f"/v1/conversations/{conversation_id}/profile",
        json={"confirmed_participation": {"CAR-10": 0}},
        headers=AS_NOA,
    )
    assert response.status_code == 422  # not part of ProfilePatch at all


def test_completing_the_profile_moves_from_collecting_to_ready() -> None:
    noa = start()["profile"]
    conversation_id = start(sample=None)["id"]
    patched = client.patch(
        f"/v1/conversations/{conversation_id}/profile",
        json={k: noa[k] for k in ("occupation", "salary", "deductions", "children_under_23", "current")},
        headers=AS_NOA,
    ).json()
    assert patched["status"] == "READY" and patched["missing"] == []
    assert Decimal(str(patched["profile"]["salary"]["base"])) == Decimal(18500)


def test_a_malformed_conversation_id_is_simply_not_found() -> None:
    response = client.get("/v1/conversations/not-a-uuid", headers=AS_NOA)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "conversation_not_found"


# ── An edit after the comparison recomputes it ───────────────────────────────


def test_editing_a_detail_after_a_comparison_recomputes_it(conversations: MemoryConversationRepo) -> None:
    conversation_id = start()["id"]
    before = client.post(
        f"/v1/conversations/{conversation_id}/compare", json={"option_ids": ["CAR-10"]}, headers=AS_NOA
    ).json()
    patched = client.patch(
        f"/v1/conversations/{conversation_id}/profile",
        json={"expected_revision": 0, "salary": {"base": 20000}},
        headers=AS_NOA,
    ).json()
    after = patched["latest_comparison"]
    assert after["id"] != before["id"]
    assert [r["option"]["id"] for r in after["results"]] == ["CAR-10"]  # the same alternative
    assert after["results"][0]["net_today"] != before["results"][0]["net_today"]
    assert after["profile_snapshot"]["revision"] == 1
    assert patched["status"] == "PRESENTED"  # still on the comparison, not back to the options
    note = patched["messages"][-1]
    assert note["role"] == "system_event" and "שכר" in note["text"] and "חושבה מחדש" in note["text"]
    request, _ = conversations.comparisons[conversation_id][-1]
    assert request["by"] == "profile_edit"


def test_an_edit_after_all_options_recomputes_all_of_them() -> None:
    conversation_id = start()["id"]
    shown = client.get(f"/v1/conversations/{conversation_id}/options", headers=AS_NOA).json()
    patched = client.patch(
        f"/v1/conversations/{conversation_id}/profile", json={"children_under_23": 0}, headers=AS_NOA
    ).json()
    ids = {r["option"]["id"] for r in patched["latest_comparison"]["results"]}
    assert ids and ids <= {r["option"]["id"] for r in shown["results"]}


def test_an_edit_before_any_comparison_computes_nothing() -> None:
    conversation_id = start()["id"]
    patched = client.patch(
        f"/v1/conversations/{conversation_id}/profile", json={"children_under_23": 1}, headers=AS_NOA
    ).json()
    assert patched["latest_comparison"] is None and patched["messages"] == []
    assert patched["status"] == "READY"


def test_a_car_chosen_in_the_card_is_matched_to_the_catalog_by_the_server() -> None:
    """QA UX06: today's car can be changed from the details card - the server decides what it is."""
    state = start("E-003")  # Rachel, on maintenance today
    noa_car = start()["profile"]["current"]  # a Corolla Cross from the catalog
    sent = {**noa_car, "catalog_id": "CAR-99", "participation": 400, "participation_status": "UNKNOWN"}
    patched = client.patch(
        f"/v1/conversations/{state['id']}/profile", json={"current": sent}, headers=AS_NOA
    ).json()
    current = patched["profile"]["current"]
    assert current["kind"] == "car" and current["catalog_id"] == noa_car["catalog_id"] != "CAR-99"
    assert current["participation_status"] == "CONFIRMED"  # the employee stated it
