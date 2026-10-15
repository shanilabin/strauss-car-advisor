"""ValueOfUseRepo backed by the Tax Authority CSV (tests, CI cross-checks, local runs).

Production reads the same data from Postgres (task A2.4); both implement the same port.
"""

from pathlib import Path

from strauss.config.schema import ValueOfUse
from strauss.domain.models import Vehicle, VehicleKey
from strauss.ingest.tax_authority_csv import read_validated


class CsvValueOfUseRepo:
    """Every row is validated while loading, so a bad file fails here - never at lookup time."""

    def __init__(self, path: Path, spec: ValueOfUse) -> None:
        self._vehicles: dict[VehicleKey, Vehicle] = {v.key: v for _, v in read_validated(path, spec)}

    def __len__(self) -> int:
        return len(self._vehicles)

    def get(self, key: VehicleKey) -> Vehicle | None:
        return self._vehicles.get(key)

    def search(self, query: str, tax_year: int, reg_year: int | None, limit: int) -> list[Vehicle]:
        """Same contract as the Supabase repo: case-insensitive 'contains' on commercial or maker name."""
        needle = " ".join(query.split()).casefold()
        if len(needle) < 2:
            return []
        matches = [
            v
            for v in self._vehicles.values()
            if v.key.tax_year == tax_year
            and (reg_year is None or v.key.reg_year == reg_year)
            and (needle in v.commercial_name.casefold() or needle in v.maker_name.casefold())
        ]
        matches.sort(key=lambda v: (v.commercial_name, -v.key.reg_year))
        return matches[:limit]
