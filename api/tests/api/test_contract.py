"""Contract tests for task A2.1.

They pin the API surface the frontend builds against, and make sure the stub data is honest:
its headline numbers must equal the challenge's reference sheet.
"""

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from index import app

client = TestClient(app)
CONFIG = Path(__file__).resolve().parents[2] / "config"
ATTO_3_KEY = "tax_year=2026&reg_year=2025&vehicle_type_code=1&maker_code=01014&model_code=00003"


# ── Surface ──────────────────────────────────────────────────────────────────


EXPECTED_OPERATIONS = {
    ("get", "/health"),
    ("post", "/v1/conversations"),
    ("get", "/v1/conversations"),
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
    ("post", "/v1/payslip/parse"),
    ("post", "/v1/conversations/{conversation_id}/rep-requests"),
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


# ── Conversations and the agent reply ────────────────────────────────────────


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


# ── Errors ───────────────────────────────────────────────────────────────────


def test_validation_error_uses_the_error_envelope() -> None:
    response = client.post("/v1/compare", json={"profile": {"salary": {"base": -5}}})
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "invalid_input" and error["message_he"]


def test_unknown_route_uses_the_error_envelope() -> None:
    response = client.get("/v1/nothing-here")
    assert response.status_code == 404
    assert response.json()["error"]["message_he"] == "לא נמצא"


# ── Review follow-ups ────────────────────────────────────────────────────────


def test_value_of_use_tolerates_unrelated_query_params() -> None:
    assert client.get(f"/v1/vehicles/value-of-use?{ATTO_3_KEY}&_t=123").status_code == 200


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
