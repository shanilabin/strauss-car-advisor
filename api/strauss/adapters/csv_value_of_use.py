"""ValueOfUseRepo backed by the Tax Authority CSV (tests, CI cross-checks, local runs).

Production reads the same data from Postgres (task A2.4); both implement the same port.
"""

from pathlib import Path

from strauss.config.schema import ValueOfUse
from strauss.domain.models import Vehicle, VehicleKey
from strauss.ingest.tax_authority_csv import read_rows, validate_row


class CsvValueOfUseRepo:
    """Every row is validated while loading, so a bad file fails here - never at lookup time."""

    def __init__(self, path: Path, spec: ValueOfUse) -> None:
        self._vehicles: dict[VehicleKey, Vehicle] = {}
        for row in read_rows(path, spec):
            vehicle = validate_row(row, spec)
            if vehicle.key in self._vehicles:
                raise ValueError(f"שורה {row.line}: מפתח כפול בקובץ רשות המסים: {vehicle.key}")
            self._vehicles[vehicle.key] = vehicle

    def __len__(self) -> int:
        return len(self._vehicles)

    def get(self, key: VehicleKey) -> Vehicle | None:
        return self._vehicles.get(key)
