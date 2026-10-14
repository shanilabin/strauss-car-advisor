"""CLI: load the Tax Authority value-of-use file into Supabase (table public.value_of_use).

    cd api
    uv run python -m strauss.ingest.load_value_of_use --csv ../data/source/value-of-use-2026.csv

Reads SUPABASE_URL and SUPABASE_SECRET_KEY from api/.env.local (or the environment).

1. Every row is read and validated first (format from rules.valueOfUse, drive codes, unique 5-field key).
   Nothing is uploaded if any row is invalid.
2. Rows are upserted in batches on the primary key, so running it again is safe (idempotent).
   With --replace, the tax year's rows are deleted first, so models dropped from a newer file go away
   (lookups for that year fail for the minute the load takes - run it outside the demo).
3. Afterwards the table is verified: row count for the tax year, and every catalog car is looked up
   by its full key and must match the catalog's value of use.
"""

import argparse
import sys
import time
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

import httpx

from strauss.adapters.supabase_rest import SupabaseError, raise_for_status, rest_client
from strauss.config.loader import load_bundle
from strauss.config.schema import ValueOfUse
from strauss.ingest.tax_authority_csv import RawRow, read_validated
from strauss.settings import get_settings

TABLE = "value_of_use"
BATCH_SIZE = 2000
INT_COLUMNS = ("tax_year", "reg_year", "vehicle_type_code", "list_price", "value_of_use")
TEXT_COLUMNS = (
    "maker_code",
    "model_code",
    "maker_name",
    "commercial_name",
    "model_desc",
    "drive_code",
    "fuel_type",
    "automatic",
    "green_score",
    "pollution_level",
    "engine_cc",
    "weight",
    "effective_date",
)


def to_db_row(row: RawRow) -> dict[str, Any]:
    """One CSV row -> one table row. Codes stay text (leading zeros); the drive code stays raw."""
    record: dict[str, Any] = {column: int(row.fields[column]) for column in INT_COLUMNS}
    record.update({column: row.fields[column] or None for column in TEXT_COLUMNS})
    adjusted = row.fields["adjusted_price"]
    record["adjusted_price"] = int(adjusted) if adjusted else None
    return record


def read_and_validate(path: Path, spec: ValueOfUse) -> list[dict[str, Any]]:
    """All rows, validated. Raises on the first invalid row or duplicate key (with its line number)."""
    return [to_db_row(raw) for raw, _ in read_validated(path, spec)]


def batches(rows: Sequence[dict[str, Any]], size: int) -> Iterator[Sequence[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def upload(client: httpx.Client, rows: Sequence[dict[str, Any]], size: int = BATCH_SIZE) -> int:
    """Upsert on the primary key. Returns the number of batches sent."""
    sent = 0
    for batch in batches(rows, size):
        response = client.post(
            f"/{TABLE}",
            json=list(batch),
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
        )
        raise_for_status(response)
        sent += 1
        print(f"  batch {sent}: {len(batch)} rows", flush=True)
    return sent


def delete_tax_year(client: httpx.Client, tax_year: int) -> None:
    response = client.delete(f"/{TABLE}", params={"tax_year": f"eq.{tax_year}"})
    raise_for_status(response)


def count_tax_year(client: httpx.Client, tax_year: int) -> int:
    response = client.get(
        f"/{TABLE}",
        params={"select": "tax_year", "tax_year": f"eq.{tax_year}", "limit": "1"},
        headers={"Prefer": "count=exact"},
    )
    raise_for_status(response)
    return int(response.headers["content-range"].split("/")[-1])


def verify_catalog(client: httpx.Client) -> list[str]:
    """Every catalog car must be found by its full key, with the catalog's value of use."""
    bundle = load_bundle()
    tax_year = bundle.rules.value_of_use.tax_year
    problems: list[str] = []
    for car in bundle.catalog:
        response = client.get(
            f"/{TABLE}",
            params={
                "select": "value_of_use,commercial_name",
                "tax_year": f"eq.{tax_year}",
                "reg_year": f"eq.{car.reg_year}",
                "vehicle_type_code": f"eq.{car.vehicle_type_code}",
                "maker_code": f"eq.{car.maker_code}",
                "model_code": f"eq.{car.model_code}",
            },
        )
        raise_for_status(response)
        found = response.json()
        if len(found) != 1:
            problems.append(f"{car.id} ({car.commercial_name}): נמצאו {len(found)} שורות במקום 1")
        elif found[0]["value_of_use"] != int(car.value_of_use):
            problems.append(f"{car.id}: שווי שימוש {found[0]['value_of_use']} במקום {car.value_of_use}")
    return problems


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="Load the Tax Authority value-of-use file into Supabase")
    parser.add_argument("--csv", type=Path, required=True, help="Tax Authority value-of-use CSV")
    parser.add_argument("--dry-run", action="store_true", help="Validate only, upload nothing")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete the tax year's rows first (drops models no longer listed)",
    )
    args = parser.parse_args(argv)

    spec = load_bundle().rules.value_of_use
    started = time.monotonic()
    rows = read_and_validate(args.csv, spec)
    print(f"✓ read and validated {len(rows)} rows, 0 duplicate keys ({time.monotonic() - started:.1f}s)")
    if args.dry_run:
        return 0

    settings = get_settings()
    try:
        with rest_client(settings.supabase_url, settings.supabase_secret_key) as client:
            if args.replace:
                delete_tax_year(client, spec.tax_year)
                print(f"✓ deleted the existing rows for tax year {spec.tax_year}")
            sent = upload(client, rows)
            in_table = count_tax_year(client, spec.tax_year)
            problems = verify_catalog(client)
    except (SupabaseError, httpx.HTTPError) as exc:
        print(f"✗ {exc}")
        print("  The table may now be partly updated. Running the same command again is safe (upsert).")
        return 1

    print(f"✓ uploaded in {sent} batches · table now has {in_table} rows for tax year {spec.tax_year}")
    if in_table != len(rows):
        print(f"! the table has {in_table} rows but the file has {len(rows)} (rows from an older file?)")
        print("  To make the table match the file exactly, run again with --replace.")
    for problem in problems:
        print(f"✗ {problem}")
    if problems:
        return 1
    print(f"✓ all {len(load_bundle().catalog)} catalog cars found by full key with matching value of use")
    print(f"done in {time.monotonic() - started:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
