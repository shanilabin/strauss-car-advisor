"""SupabaseValueOfUseRepo against a simulated PostgREST - no network, no keys."""

from decimal import Decimal
from typing import Any

import httpx
import pytest

from strauss.adapters.supabase_rest import SupabaseError, rest_client
from strauss.adapters.supabase_value_of_use import SupabaseValueOfUseRepo
from strauss.config.loader import load_rules
from strauss.domain.models import Drive, VehicleKey

SPEC = load_rules().value_of_use
ATTO_ROW = {
    "tax_year": 2026, "reg_year": 2025, "vehicle_type_code": 1, "maker_code": "01014",
    "model_code": "00003", "maker_name": "בי ווי די", "commercial_name": "ATTO 3",
    "model_desc": "SC2E-SC2E01", "drive_code": "3", "list_price": 177500, "value_of_use": 3130,
}  # fmt: skip
ATTO_KEY = VehicleKey(
    tax_year=2026, reg_year=2025, vehicle_type_code=1, maker_code="01014", model_code="00003"
)


def repo_answering(
    rows: list[dict[str, Any]], seen: list[httpx.Request] | None = None
) -> SupabaseValueOfUseRepo:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(200, json=rows)

    client = rest_client("https://abcdefghijklmnopqrst.supabase.co", "sb_secret_test",
                         transport=httpx.MockTransport(handler))  # fmt: skip
    return SupabaseValueOfUseRepo(client, SPEC)


def test_get_filters_on_all_five_key_fields_and_maps_the_drive_code() -> None:
    seen: list[httpx.Request] = []
    vehicle = repo_answering([ATTO_ROW], seen).get(ATTO_KEY)
    params = seen[0].url.params
    key_fields = ("tax_year", "reg_year", "vehicle_type_code", "maker_code", "model_code")
    assert {f: params[f] for f in key_fields} == {
        "tax_year": "eq.2026", "reg_year": "eq.2025", "vehicle_type_code": "eq.1",
        "maker_code": "eq.01014", "model_code": "eq.00003",
    }  # fmt: skip
    assert vehicle is not None
    assert vehicle.key == ATTO_KEY
    assert vehicle.drive == Drive.ELECTRIC  # code 3 per rules.valueOfUse.driveField, not the CSV header
    assert vehicle.value_of_use == Decimal(3130)


def test_get_returns_none_when_the_key_is_unknown() -> None:
    assert repo_answering([]).get(ATTO_KEY) is None


def test_get_refuses_to_pick_when_more_than_one_row_comes_back() -> None:
    with pytest.raises(SupabaseError, match="שורות למפתח אחד"):
        repo_answering([ATTO_ROW, ATTO_ROW]).get(ATTO_KEY)


def test_unknown_drive_code_is_an_error_not_a_guess() -> None:
    with pytest.raises(SupabaseError, match="קוד הנעה"):
        repo_answering([{**ATTO_ROW, "drive_code": "9"}]).get(ATTO_KEY)


def test_search_matches_name_or_maker_within_the_tax_year() -> None:
    seen: list[httpx.Request] = []
    results = repo_answering([ATTO_ROW], seen).search("atto", 2026, None, 5)
    params = seen[0].url.params
    assert params["or"] == "(commercial_name.ilike.*atto*,maker_name.ilike.*atto*)"
    assert params["tax_year"] == "eq.2026" and params["limit"] == "5"
    assert "reg_year" not in params
    assert [v.commercial_name for v in results] == ["ATTO 3"]


def test_search_strips_characters_that_would_change_the_filter() -> None:
    seen: list[httpx.Request] = []
    repo_answering([], seen).search("atto),id.eq.(1*", 2026, 2025, 5)
    assert (
        seen[0].url.params["or"] == "(commercial_name.ilike.*atto id eq 1*,maker_name.ilike.*atto id eq 1*)"
    )
    assert seen[0].url.params["reg_year"] == "eq.2025"


def test_search_with_nothing_meaningful_left_skips_the_request() -> None:
    seen: list[httpx.Request] = []
    assert repo_answering([], seen).search("()", 2026, None, 5) == []
    assert seen == []


def test_server_errors_surface_as_supabase_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, text="boom")

    client = rest_client("https://abcdefghijklmnopqrst.supabase.co", "sb_secret_test",
                         transport=httpx.MockTransport(handler))  # fmt: skip
    with pytest.raises(SupabaseError, match="500"):
        SupabaseValueOfUseRepo(client, SPEC).get(ATTO_KEY)


def test_underscore_is_not_a_wildcard() -> None:
    seen: list[httpx.Request] = []
    repo_answering([], seen).search("A_3", 2026, None, 5)
    assert "commercial_name.ilike.*A 3*" in seen[0].url.params["or"]  # the term has no "_" left
