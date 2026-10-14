"""The loader, against a simulated Supabase (httpx.MockTransport) - no network, no keys."""

import json
from decimal import Decimal
from functools import lru_cache
from typing import Any

import httpx
import pytest

from strauss.adapters.supabase_rest import SupabaseError, auth_headers, rest_client
from strauss.config.loader import load_bundle, load_rules
from strauss.ingest.load_value_of_use import (
    count_tax_year,
    delete_tax_year,
    main,
    read_and_validate,
    to_db_row,
    upload,
    verify_catalog,
)
from strauss.ingest.tax_authority_csv import read_rows
from tests.conftest import TAX_AUTHORITY_CSV

SPEC = load_rules().value_of_use


@lru_cache
def all_rows() -> list[dict[str, Any]]:
    """The whole file, parsed and validated once for this module."""
    return read_and_validate(TAX_AUTHORITY_CSV, SPEC)


def client_with(handler: Any, key: str = "sb_secret_test") -> httpx.Client:
    return rest_client("https://example.supabase.co", key, transport=httpx.MockTransport(handler))


def test_row_conversion_keeps_codes_as_text_and_numbers_as_integers() -> None:
    atto = next(
        r
        for r in read_rows(TAX_AUTHORITY_CSV, SPEC)
        if (
            r.fields["maker_code"],
            r.fields["model_code"],
            r.fields["reg_year"],
            r.fields["vehicle_type_code"],
        )
        == ("01014", "00003", "2025", "1")
    )
    row = to_db_row(atto)
    assert row["maker_code"] == "01014" and row["model_code"] == "00003"  # leading zeros kept
    assert row["value_of_use"] == 3130 and row["list_price"] == 177500
    assert row["drive_code"] == "3"  # raw code; mapped to a drive by rules.valueOfUse.driveField
    assert set(row) == {
        "tax_year", "reg_year", "vehicle_type_code", "maker_code", "model_code", "maker_name",
        "commercial_name", "model_desc", "drive_code", "fuel_type", "automatic", "green_score",
        "pollution_level", "engine_cc", "weight", "effective_date", "list_price", "adjusted_price",
        "value_of_use",
    }  # fmt: skip


def test_the_whole_file_validates() -> None:
    assert len(all_rows()) == 77_988


def test_upload_upserts_in_batches_with_the_secret_key_only_server_side() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201)

    rows = [{"n": i} for i in range(4500)]
    with client_with(handler) as client:
        assert upload(client, rows, size=2000) == 3
    assert [len(json.loads(r.content)) for r in seen] == [2000, 2000, 500]
    for request in seen:
        assert request.url.path == "/rest/v1/value_of_use"
        assert "resolution=merge-duplicates" in request.headers["prefer"]  # rerunning is safe
        assert request.headers["apikey"] == "sb_secret_test"
        assert "authorization" not in request.headers


def test_legacy_jwt_keys_are_also_sent_as_bearer() -> None:
    assert auth_headers("eyJhbGciOi.legacy")["Authorization"] == "Bearer eyJhbGciOi.legacy"
    assert "Authorization" not in auth_headers("sb_secret_new")


def test_upload_stops_on_the_first_failed_batch() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, json={"message": "violates check constraint"})

    with client_with(handler) as client, pytest.raises(SupabaseError, match="400"):
        upload(client, [{"n": 1}] * 5000, size=2000)
    assert calls == 1


def test_missing_credentials_fail_clearly() -> None:
    with pytest.raises(SupabaseError, match="SUPABASE_SECRET_KEY"):
        rest_client("https://example.supabase.co", "")


def test_count_reads_the_exact_count_header() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["prefer"] == "count=exact"
        return httpx.Response(200, json=[], headers={"content-range": "0-0/77988"})

    with client_with(handler) as client:
        assert count_tax_year(client, 2026) == 77_988


def _catalog_server(override: dict[str, int] | None = None) -> Any:
    """Answers lookups by full key from the catalog, optionally with a wrong value for some model codes."""
    catalog = {(c.maker_code, c.model_code, str(c.reg_year)): c for c in load_bundle().catalog}

    def handler(request: httpx.Request) -> httpx.Response:
        params = request.url.params
        for field in ("tax_year", "reg_year", "vehicle_type_code", "maker_code", "model_code"):
            assert params[field].startswith("eq."), f"{field} must be part of the lookup"
        key = tuple(params[f].removeprefix("eq.") for f in ("maker_code", "model_code", "reg_year"))
        car = catalog[key]
        value = (override or {}).get(car.model_code, int(car.value_of_use))
        return httpx.Response(200, json=[{"value_of_use": value, "commercial_name": car.commercial_name}])

    return handler


def test_catalog_verification_uses_the_full_key_and_passes_on_matching_data() -> None:
    with client_with(_catalog_server()) as client:
        assert verify_catalog(client) == []


def test_catalog_verification_reports_a_wrong_value() -> None:
    atto_model = next(c.model_code for c in load_bundle().catalog if c.id == "CAR-10")
    with client_with(_catalog_server({atto_model: 9999})) as client:
        problems = verify_catalog(client)
    assert len(problems) == 1 and "CAR-10" in problems[0] and "9999" in problems[0]


def test_dry_run_validates_without_any_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def no_network(*args: Any, **kwargs: Any) -> None:
        raise AssertionError("dry run must not connect")

    monkeypatch.setattr("strauss.ingest.load_value_of_use.rest_client", no_network)
    assert main(["--csv", str(TAX_AUTHORITY_CSV), "--dry-run"]) == 0


def test_values_in_the_upload_match_the_catalog() -> None:
    index = {(r["maker_code"], r["model_code"], r["reg_year"], r["vehicle_type_code"]): r for r in all_rows()}
    for car in load_bundle().catalog:
        row = index[(car.maker_code, car.model_code, car.reg_year, car.vehicle_type_code)]
        assert Decimal(row["value_of_use"]) == car.value_of_use


def test_replace_deletes_only_the_tax_year_before_uploading() -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(204)

    with client_with(handler) as client:
        delete_tax_year(client, 2026)
    assert seen[0].method == "DELETE"
    assert seen[0].url.params["tax_year"] == "eq.2026"
