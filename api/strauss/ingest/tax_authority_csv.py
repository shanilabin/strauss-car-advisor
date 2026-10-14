"""Reads the Tax Authority's extended value-of-use file.

The format (encoding, column names, drive codes) comes from rules.valueOfUse, so next year's file
needs a config change, not a code change. Two traps handled here, both verified against the data:
- The drive column's header says 1=electric/2=hybrid/3=plug-in; the data is 0=petrol, 1=hybrid,
  2=plug-in, 3=electric. The mapping is config (driveField), not the header.
- Codes are zero-padded strings ("00885") and every field is space-padded.
"""

import csv
from collections.abc import Iterator
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

from strauss.config.schema import ValueOfUse
from strauss.domain.models import Vehicle, VehicleKey


@dataclass(frozen=True)
class RawRow:
    """One file row, trimmed, keyed by our field names (rules.valueOfUse.csv.columns)."""

    line: int
    fields: dict[str, str]

    def key(self) -> VehicleKey:
        return VehicleKey(
            tax_year=int(self.fields["tax_year"]),
            reg_year=int(self.fields["reg_year"]),
            vehicle_type_code=int(self.fields["vehicle_type_code"]),
            maker_code=self.fields["maker_code"],
            model_code=self.fields["model_code"],
        )

    def to_vehicle(self, spec: ValueOfUse) -> Vehicle:
        code = self.fields["drive_code"]
        if code not in spec.drive_field:
            raise ValueError(f"קוד הנעה לא מוכר בקובץ: {code!r}")
        return Vehicle(
            key=self.key(),
            maker_name=self.fields["maker_name"],
            commercial_name=self.fields["commercial_name"],
            model_desc=self.fields["model_desc"],
            drive=spec.drive_field[code],
            list_price=Decimal(self.fields["list_price"]),
            value_of_use=Decimal(self.fields["value_of_use"]),
        )


def read_rows(path: Path, spec: ValueOfUse) -> Iterator[RawRow]:
    """Yield trimmed rows. Fails fast, with the line number, on a missing column or a short row."""
    columns = spec.csv.columns.model_dump()
    with path.open(encoding=spec.csv.encoding, newline="") as handle:
        reader = csv.reader(handle)
        header = [name.strip() for name in next(reader)]
        missing = [name for name in columns.values() if name not in header]
        if missing:
            raise ValueError(f"עמודות חסרות בקובץ רשות המסים: {missing}")
        index = {field: header.index(name) for field, name in columns.items()}
        width = max(index.values()) + 1
        for row in reader:
            if not any(cell.strip() for cell in row):
                continue
            if len(row) < width:
                raise ValueError(f"שורה {reader.line_num} בקובץ רשות המסים קצרה מדי ({len(row)} עמודות)")
            yield RawRow(reader.line_num, {field: row[i].strip() for field, i in index.items()})


def validate_row(row: RawRow, spec: ValueOfUse) -> Vehicle:
    """Convert a row, turning any problem into an error that names the line."""
    try:
        return row.to_vehicle(spec)
    except ValueError as exc:
        raise ValueError(f"שורה {row.line} בקובץ רשות המסים: {exc}") from exc
