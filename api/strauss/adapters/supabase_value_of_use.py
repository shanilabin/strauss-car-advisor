"""ValueOfUseRepo backed by Supabase (table public.value_of_use, loaded by strauss.ingest)."""

import re
from decimal import Decimal
from typing import Any

import httpx

from strauss.adapters.supabase_rest import SupabaseError, raise_for_status
from strauss.config.schema import ValueOfUse
from strauss.domain.models import Vehicle, VehicleKey

TABLE = "/value_of_use"
COLUMNS = (
    "tax_year,reg_year,vehicle_type_code,maker_code,model_code,"
    "maker_name,commercial_name,model_desc,drive_code,list_price,value_of_use"
)
# PostgREST filter syntax uses , ( ) . : * " \ and ILIKE treats _ as a wildcard - keep only name characters
UNSAFE_FOR_FILTER = re.compile(r"[^\w\s\-/'+]|_")


class SupabaseValueOfUseRepo:
    def __init__(self, client: httpx.Client, spec: ValueOfUse) -> None:
        self._client = client
        self._spec = spec

    def get(self, key: VehicleKey) -> Vehicle | None:
        response = self._client.get(
            TABLE,
            params={
                "select": COLUMNS,
                "tax_year": f"eq.{key.tax_year}",
                "reg_year": f"eq.{key.reg_year}",
                "vehicle_type_code": f"eq.{key.vehicle_type_code}",
                "maker_code": f"eq.{key.maker_code}",
                "model_code": f"eq.{key.model_code}",
            },
        )
        raise_for_status(response)
        rows: list[dict[str, Any]] = response.json()
        if len(rows) > 1:  # impossible with the primary key; refuse rather than pick one
            raise SupabaseError(f"נמצאו {len(rows)} שורות למפתח אחד: {key}")
        return self._to_vehicle(rows[0]) if rows else None

    def search(self, query: str, tax_year: int, reg_year: int | None, limit: int) -> list[Vehicle]:
        term = " ".join(UNSAFE_FOR_FILTER.sub(" ", query).split())
        if len(term) < 2:
            return []
        params = {
            "select": COLUMNS,
            "tax_year": f"eq.{tax_year}",
            "or": f"(commercial_name.ilike.*{term}*,maker_name.ilike.*{term}*)",
            "order": "commercial_name.asc,reg_year.desc",
            "limit": str(limit),
        }
        if reg_year is not None:
            params["reg_year"] = f"eq.{reg_year}"
        response = self._client.get(TABLE, params=params)
        raise_for_status(response)
        return [self._to_vehicle(row) for row in response.json()]

    def _to_vehicle(self, row: dict[str, Any]) -> Vehicle:
        code = str(row["drive_code"])
        if code not in self._spec.drive_field:
            raise SupabaseError(f"קוד הנעה לא מוכר במאגר: {code!r}")
        return Vehicle(
            key=VehicleKey(
                tax_year=row["tax_year"],
                reg_year=row["reg_year"],
                vehicle_type_code=row["vehicle_type_code"],
                maker_code=row["maker_code"],
                model_code=row["model_code"],
            ),
            maker_name=row["maker_name"],
            commercial_name=row["commercial_name"],
            model_desc=row["model_desc"],
            drive=self._spec.drive_field[code],
            list_price=Decimal(row["list_price"]),
            value_of_use=Decimal(row["value_of_use"]),
        )
