"""Contract tests for task A2.1.

They pin the API surface the frontend builds against, and make sure the stub data is honest:
its headline numbers must equal the challenge's reference sheet.
"""

import json
import re
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from index import app
from strauss.http import stubs

client = TestClient(app)
CONFIG = Path(__file__).resolve().parents[2] / "config"
REFERENCE = json.loads((CONFIG / "reference-results.json").read_text("utf-8"))
NOA = next(r for r in REFERENCE if r["employeeId"] == "E-001")
ATTO_3_KEY = "tax_year=2026&reg_year=2025&vehicle_type_code=1&maker_code=01014&model_code=00003"


@pytest.fixture(autouse=True)
def fresh_rep_store() -> Iterator[None]:
    stubs.rep_store = stubs.RepStubStore()
    yield


def _option(comparison: dict, option_id: str) -> dict:
    return next(r for r in comparison["results"] if r["option"]["id"] == option_id)


# ── Surface ──────────────────────────────────────────────────────────────────


EXPECTED_OPERATIONS = {
    ("get", "/health"),
    ("post", "/v1/conversations"),
    ("get", "/v1/conversations/{conversation_id}"),
    ("post", "/v1/conversations/{conversation_id}/messages"),
    ("patch", "/v1/conversations/{conversation_id}/profile"),
    ("get", "/v1/conversations/{conversation_id}/options"),
    ("post", "/v1/conversations/{conversation_id}/compare"),
    ("post", "/v1/compare"),
    ("get", "/v1/vehicles/search"),
    ("get", "/v1/vehicles/value-of-use"),
    ("get", "/v1/catalog"),
    ("get", "/v1/occupations"),
    ("get", "/v1/config"),
    ("get", "/v1/rep/questions"),
    ("post", "/v1/rep/questions/{question_id}/answer"),
}


def test_every_contract_operation_exists() -> None:
    spec = app.openapi()
    actual = {(method, path) for path, ops in spec["paths"].items() for method in ops}
    assert actual == EXPECTED_OPERATIONS


def test_money_is_a_json_number_in_the_contract() -> None:
    schemas = app.openapi()["components"]["schemas"]
    net = schemas["NetBreakdown"]["properties"]["net"]
    assert net["type"] == "number"


def test_committed_openapi_file_is_up_to_date() -> None:
    committed = json.loads((Path(__file__).resolve().parents[2] / "openapi.json").read_text("utf-8"))
    assert committed == json.loads(json.dumps(app.openapi(), ensure_ascii=False))


# ── Stub honesty: numbers equal the challenge reference ──────────────────────


def test_noa_atto3_matches_reference_sheet() -> None:
    comparison = client.post("/v1/conversations/x/compare", json={"option_ids": ["CAR-10"]}).json()
    atto = _option(comparison, "CAR-10")
    assert round(comparison["today"]["net"]) == NOA["netToday"]
    assert round(comparison["today"]["income_tax"]) == NOA["taxToday"]
    insurance_today = comparison["today"]["national_insurance"] + comparison["today"]["health"]
    assert round(insurance_today) == NOA["insuranceToday"]
    assert round(atto["net_option"]) == NOA["netAlternative"]
    assert round(atto["delta"]) == NOA["delta"]
    assert round(atto["breakdown"]["income_tax"]) == NOA["taxAlternative"]
    assert round(atto["breakdown"]["electric_gross_up"]) == NOA["electricGrossUp"]


def test_every_waterfall_sums_to_its_delta() -> None:
    comparison = client.get("/v1/conversations/x/options").json()
    for result in comparison["results"]:
        if result["delta"] is None:
            assert result["waterfall"] == []
            continue
        total = sum(Decimal(str(step["delta"])) for step in result["waterfall"])
        assert total == Decimal(str(result["delta"])), result["option"]["id"]


def test_net_option_equals_breakdown_net_and_today_plus_delta() -> None:
    comparison = client.get("/v1/conversations/x/options").json()
    for result in comparison["results"]:
        if result["breakdown"] is None:
            continue
        # Headline numbers are whole shekels; the breakdown keeps agorot (ARCHITECTURE.md, rounding policy)
        assert result["net_option"] == round(result["breakdown"]["net"])
        assert result["net_today"] + result["delta"] == result["net_option"]


def test_ineligible_option_shows_reason_but_no_numbers() -> None:
    model3 = _option(client.get("/v1/conversations/x/options").json(), "CAR-14")
    assert model3["eligibility"]["eligible"] is False
    assert model3["eligibility"]["reason"]
    assert model3["net_option"] is None and model3["delta"] is None and model3["breakdown"] is None


def test_best_option_is_the_highest_eligible_delta() -> None:
    comparison = client.get("/v1/conversations/x/options").json()
    eligible = [r for r in comparison["results"] if r["eligibility"]["eligible"]]
    assert comparison["best_option_id"] == max(eligible, key=lambda r: r["delta"])["option"]["id"]


def test_comparison_carries_reproducibility_context() -> None:
    context = client.get("/v1/conversations/x/options").json()["context"]
    assert context["payroll_tax_year"] == 2025
    assert context["value_of_use_tax_year"] == 2026
    assert re.fullmatch(r"[0-9a-f]{64}", context["config_hash"])


# ── Conversations and the agent reply ────────────────────────────────────────


def test_agent_reply_text_has_no_numbers_numbers_live_in_cards() -> None:
    body = client.post("/v1/conversations/x/messages", json={"text": "כמה אקבל בנטו?"}).json()
    assert not re.search(r"\d{2,}", body["reply"]["text"]), "numbers must come from cards, not text"
    kinds = [card["kind"] for card in body["reply"]["cards"]]
    assert "options" in kinds
    assert body["trace"], "every turn returns its trace"


def test_create_conversation_from_sample_employee() -> None:
    response = client.post("/v1/conversations", json={"sample_employee_id": "E-003"})
    assert response.status_code == 201
    profile = response.json()["profile"]
    assert profile["occupation"] == "מפתח/ת תוכנה"
    assert profile["current"] == {"kind": "waiver", "maintenance": 1500.0}


def test_unknown_sample_employee_is_404_in_hebrew() -> None:
    response = client.post("/v1/conversations", json={"sample_employee_id": "E-999"})
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "sample_employee_not_found"


def test_profile_patch_bumps_revision_and_rejects_stale_revision() -> None:
    ok = client.patch("/v1/conversations/x/profile", json={"expected_revision": 3, "children_under_23": 4})
    assert ok.status_code == 200
    assert ok.json()["profile"]["revision"] == 4
    assert ok.json()["profile"]["children_under_23"] == 4
    stale = client.patch("/v1/conversations/x/profile", json={"expected_revision": 1, "group": "ד"})
    assert stale.status_code == 409
    assert stale.json()["error"]["code"] == "stale_revision"


# ── Vehicles ─────────────────────────────────────────────────────────────────


def test_value_of_use_by_full_key() -> None:
    vehicle = client.get(f"/v1/vehicles/value-of-use?{ATTO_3_KEY}").json()
    assert vehicle["commercial_name"] == "ATTO 3"
    assert vehicle["value_of_use"] == 3130


def test_value_of_use_requires_every_key_field() -> None:
    response = client.get("/v1/vehicles/value-of-use?maker_code=01014&model_code=00003")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_input"


def test_unknown_vehicle_key_is_404_not_a_guess() -> None:
    response = client.get(f"/v1/vehicles/value-of-use?{ATTO_3_KEY.replace('00003', '99999')}")
    assert response.status_code == 404


def test_vehicle_search_returns_full_keys() -> None:
    results = client.get("/v1/vehicles/search?q=atto").json()
    assert results and all(len(r["key"]) == 5 for r in results)


# ── Config ───────────────────────────────────────────────────────────────────


def test_catalog_and_occupations_come_from_config() -> None:
    assert len(client.get("/v1/catalog").json()) == 20
    assert len(client.get("/v1/occupations").json()) == 14


def test_config_summary() -> None:
    summary = client.get("/v1/config").json()
    assert [g["code"] for g in summary["groups"]] == ["א", "ב", "ג", "ד"]
    assert summary["payroll_tax_year"] == 2025 and summary["value_of_use_tax_year"] == 2026


# ── Rep ──────────────────────────────────────────────────────────────────────


def test_rep_sees_minimal_context_without_salary() -> None:
    question = client.get("/v1/rep/questions").json()[0]
    assert "salary" not in json.dumps(question) and "18500" not in json.dumps(question)


def test_rep_answers_once_second_answer_is_409() -> None:
    first = client.post("/v1/rep/questions/q-stub-1/answer", json={"value": "350"})
    assert first.status_code == 200
    assert first.json()["status"] == "ANSWERED"
    second = client.post("/v1/rep/questions/q-stub-1/answer", json={"value": "400"})
    assert second.status_code == 409
    assert second.json()["error"]["code"] == "already_answered"
    assert client.get("/v1/rep/questions?status=OPEN").json() == []
    assert client.get("/v1/rep/questions").json()[0]["answer"]["value"] == "350"


# ── Errors ───────────────────────────────────────────────────────────────────


def test_validation_error_uses_the_error_envelope() -> None:
    response = client.post("/v1/conversations/x/messages", json={"text": ""})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_input" and error["message_he"]


def test_unknown_route_uses_the_error_envelope() -> None:
    response = client.get("/v1/nothing-here")
    assert response.status_code == 404
    assert response.json()["error"]["message_he"] == "לא נמצא"


# ── Review follow-ups ────────────────────────────────────────────────────────


def test_selected_comparison_best_option_is_one_of_its_results() -> None:
    comparison = client.post("/v1/conversations/x/compare", json={"option_ids": ["CAR-10", "CAR-14"]}).json()
    assert comparison["best_option_id"] == "CAR-10"


def test_profile_patch_ignores_null_instead_of_erasing() -> None:
    profile = client.patch("/v1/conversations/x/profile", json={"salary": None}).json()["profile"]
    assert profile["salary"]["base"] == 18500


def test_value_of_use_tolerates_unrelated_query_params() -> None:
    assert client.get(f"/v1/vehicles/value-of-use?{ATTO_3_KEY}&_t=123").status_code == 200


def test_assistant_messages_carry_their_trace_after_reload() -> None:
    """The UI shows 'show AI actions' under each bot message, also after a refresh."""
    state = client.get("/v1/conversations/x").json()
    assistant = [m for m in state["messages"] if m["role"] == "assistant"]
    assert assistant and all(m["trace"] for m in assistant)
    assert all(m["trace"] == [] for m in state["messages"] if m["role"] == "user")


def test_tang_and_atto3_share_codes_but_are_different_cars() -> None:
    tang_key = ATTO_3_KEY.replace("vehicle_type_code=1", "vehicle_type_code=2")
    tang = client.get(f"/v1/vehicles/value-of-use?{tang_key}").json()
    assert tang["commercial_name"] == "TANG" and tang["value_of_use"] != 3130


def test_search_filters_by_registration_year() -> None:
    results = client.get("/v1/vehicles/search?q=corolla cross&reg_year=2022").json()
    assert results and all(r["key"]["reg_year"] == 2022 for r in results)


def test_data_service_failure_is_a_503_in_hebrew() -> None:
    from strauss.adapters.supabase_rest import SupabaseError
    from strauss.http.deps import get_value_of_use_repo

    class Broken:
        def get(self, key: object) -> None:
            raise SupabaseError("connection refused")

        def search(self, *args: object) -> list[object]:
            raise SupabaseError("connection refused")

    app.dependency_overrides[get_value_of_use_repo] = Broken
    response = client.get(f"/v1/vehicles/value-of-use?{ATTO_3_KEY}")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "data_unavailable"
    assert "connection refused" not in response.text  # internals stay in the server log


# ── Stateless compare runs the real engine ──────────────────────────────────


def _noa_profile() -> dict[str, Any]:
    from strauss.config.loader import load_bundle, load_sample_employees
    from strauss.config.samples import to_profile

    noa = next(e for e in load_sample_employees() if e.id == "E-001")
    return to_profile(noa, load_bundle()).model_dump(mode="json")


def test_stateless_compare_is_the_real_engine() -> None:
    response = client.post("/v1/compare", json={"profile": _noa_profile(), "option_ids": ["CAR-10"]})
    assert response.status_code == 200
    atto = response.json()["results"][0]
    assert (atto["net_today"], atto["net_option"], atto["delta"]) == (11032, 11693, 661)


def test_stateless_compare_with_missing_data_says_what_to_ask() -> None:
    response = client.post("/v1/compare", json={"profile": {"occupation": "מנהל/ת מוצר"}})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "incomplete_profile"
    assert [m["field"] for m in error["details"]["missing"]] == ["salary.base", "deductions", "current"]


def test_stateless_compare_unknown_option_is_404() -> None:
    response = client.post("/v1/compare", json={"profile": _noa_profile(), "option_ids": ["CAR-99"]})
    assert response.status_code == 404


def test_stateless_compare_rereads_todays_car_and_ignores_client_confirmations() -> None:
    tampered = _noa_profile()
    tampered["current"]["vehicle"]["value_of_use"] = 1  # client claims a tiny value of use
    tampered["confirmed_participation"] = {"CAR-10": 0}  # and a rep confirmation it can't have
    body = client.post("/v1/compare", json={"profile": tampered, "option_ids": ["CAR-10"]}).json()
    atto = body["results"][0]
    assert body["today"]["value_of_use"] == 4070  # official Tax Authority value
    assert atto["net_today"] == 11032
    assert atto["participation_status"] == "DEFAULT_PENDING" and atto["participation"] == 300
