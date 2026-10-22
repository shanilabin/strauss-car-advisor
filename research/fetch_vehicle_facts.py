# -*- coding: utf-8 -*-
"""
Fetches what the Ministry of Transport publishes about each catalog car (seats, safety equipment level,
body, fuel, horsepower, trim) into api/config/vehicle-facts.json.

Run from the repo root:
    uv run --project api python research/fetch_vehicle_facts.py

Source: the Ministry of Transport's vehicle models database on data.gov.il (one row per model and year).
A car is matched by its full key - maker code, model code and year - exactly like the value of use. When
one key has several rows (BYD's codes cover both ATTO 3 and TANG), the catalog's model description picks
the row. A car with no row for its year gets no facts: the advisor then says the data is missing, it does
not borrow another year. The output is committed; nothing here is a business number, only a conversion.
"""

import json
from datetime import date
from pathlib import Path
from typing import Any

import httpx

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "api" / "config"
API = "https://data.gov.il/api/3/action/datastore_search"
RESOURCE_ID = "142afde2-6228-49f9-8a29-9b6c3a0cbe40"
DATASET_URL = "https://data.gov.il/dataset/degem-rechev-wltp"


def rows_for(client: httpx.Client, car: dict[str, Any]) -> list[dict[str, Any]]:
    key = {"tozeret_cd": int(car["makerCode"]), "degem_cd": int(car["modelCode"]), "shnat_yitzur": car["regYear"]}
    response = client.get(API, params={"resource_id": RESOURCE_ID, "filters": json.dumps(key), "limit": 20})
    response.raise_for_status()
    records: list[dict[str, Any]] = response.json()["result"]["records"]
    return records


def positive(value: Any) -> int | None:
    """The database writes 0 (or nothing) where a value is unknown - e.g. an electric car's horsepower."""
    return int(value) if value else None


def facts(car: dict[str, Any], row: dict[str, Any]) -> dict[str, Any]:
    return {
        "catalogId": car["id"],
        "seats": positive(row["mispar_moshavim"]),
        "safetyLevel": positive(row["ramat_eivzur_betihuty"]),
        "body": (row["merkav"] or "").strip() or None,
        "fuel": (row["delek_nm"] or "").strip() or None,
        "horsepower": positive(row["koah_sus"]),
        "trim": (row["ramat_gimur"] or "").strip() or None,
    }


def main() -> None:
    catalog = json.loads((CONFIG / "catalog.json").read_text(encoding="utf-8"))
    cars: list[dict[str, Any]] = []
    with httpx.Client(timeout=30) as client:
        for car in catalog:
            rows = rows_for(client, car)
            if len(rows) > 1:
                rows = [r for r in rows if (r["degem_nm"] or "").strip() == car["modelDesc"]]
            if len(rows) != 1:
                print(f"{car['id']} {car['commercialName']} {car['regYear']}: {len(rows)} rows - no facts")
                continue
            cars.append(facts(car, rows[0]))
    out = {
        "source": {
            "name": "משרד התחבורה - תוצרים ודגמים של כלי רכב פרטי ומסחרי",
            "url": DATASET_URL,
            "resourceId": RESOURCE_ID,
            "fetchedOn": date.today().isoformat(),
        },
        "cars": cars,
    }
    text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    (CONFIG / "vehicle-facts.json").write_text(text, encoding="utf-8")
    print(f"{len(cars)}/{len(catalog)} catalog cars have facts")


if __name__ == "__main__":
    main()
