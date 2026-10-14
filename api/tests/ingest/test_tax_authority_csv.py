"""Reading the real Tax Authority file - including the two traps found in the data."""

from decimal import Decimal
from pathlib import Path

import pytest

from strauss.adapters.csv_value_of_use import CsvValueOfUseRepo
from strauss.config.loader import load_rules
from strauss.domain.models import Drive, VehicleKey
from strauss.ingest.tax_authority_csv import read_rows
from tests.conftest import TAX_AUTHORITY_CSV


def _key(reg_year: int, type_code: int, maker: str, model: str) -> VehicleKey:
    return VehicleKey(
        tax_year=2026, reg_year=reg_year, vehicle_type_code=type_code, maker_code=maker, model_code=model
    )


def test_every_row_is_read_with_a_unique_full_key(tax_authority: CsvValueOfUseRepo) -> None:
    assert len(tax_authority) == 77_988


def test_atto3_value_of_use(tax_authority: CsvValueOfUseRepo) -> None:
    atto = tax_authority.get(_key(2025, 1, "01014", "00003"))
    assert atto is not None
    assert atto.commercial_name == "ATTO 3"
    assert atto.value_of_use == Decimal("3130")
    assert atto.list_price == Decimal("177500")


def test_maker_and_model_code_alone_are_not_enough(tax_authority: CsvValueOfUseRepo) -> None:
    """Trap 1: in 2025, maker 01014 + model 00003 is both ATTO 3 (type 1) and TANG (type 2)."""
    atto = tax_authority.get(_key(2025, 1, "01014", "00003"))
    tang = tax_authority.get(_key(2025, 2, "01014", "00003"))
    assert atto is not None and tang is not None
    assert (atto.commercial_name, tang.commercial_name) == ("ATTO 3", "TANG")
    assert atto.value_of_use != tang.value_of_use


def test_registration_year_changes_the_value(tax_authority: CsvValueOfUseRepo) -> None:
    values = {year: tax_authority.get(_key(year, 1, "00413", "00296")) for year in (2022, 2025)}
    assert values[2022] is not None and values[2025] is not None
    assert values[2022].value_of_use == Decimal("4420")
    assert values[2025].value_of_use == Decimal("4070")


@pytest.mark.parametrize(
    ("key", "drive"),
    [
        (_key(2025, 1, "00885", "00643"), Drive.PETROL),  # PICANTO
        (_key(2025, 1, "00413", "00296"), Drive.HYBRID),  # COROLLA CROSS
        (_key(2026, 1, "00416", "00294"), Drive.PLUG_IN),  # SPORTAGE HEV
        (_key(2025, 1, "01327", "00730"), Drive.ELECTRIC),  # TESLA MODEL 3
    ],
)
def test_drive_codes_follow_the_data_not_the_header(
    tax_authority: CsvValueOfUseRepo, key: VehicleKey, drive: Drive
) -> None:
    """Trap 2: the header says 1=EV/2=hybrid/3=plug-in; the data is 0/1/2/3 = petrol/hybrid/plug-in/EV."""
    vehicle = tax_authority.get(key)
    assert vehicle is not None and vehicle.drive == drive


def test_unknown_key_returns_none_never_a_guess(tax_authority: CsvValueOfUseRepo) -> None:
    assert tax_authority.get(_key(2025, 1, "01014", "99999")) is None


def test_missing_column_fails_fast() -> None:
    spec = load_rules().value_of_use
    columns = spec.csv.columns.model_copy(update={"value_of_use": "עמודה שלא קיימת"})
    broken = spec.model_copy(update={"csv": spec.csv.model_copy(update={"columns": columns})})
    with pytest.raises(ValueError, match="עמודות חסרות"):
        next(read_rows(TAX_AUTHORITY_CSV, broken))


def test_unknown_drive_code_fails_at_load_with_the_line_number(tmp_path: Path) -> None:
    spec = load_rules().value_of_use
    lines = TAX_AUTHORITY_CSV.read_bytes().splitlines(keepends=True)
    sample = tmp_path / "sample.csv"
    sample.write_bytes(b"".join(lines[:3]))
    without_hybrid = {k: v for k, v in spec.drive_field.items() if k != "0"}
    narrowed = spec.model_copy(update={"drive_field": without_hybrid})
    with pytest.raises(ValueError, match="שורה 2"):
        CsvValueOfUseRepo(sample, narrowed)


def test_short_row_fails_with_the_line_number(tmp_path: Path) -> None:
    spec = load_rules().value_of_use
    header = TAX_AUTHORITY_CSV.read_bytes().splitlines(keepends=True)[0]
    sample = tmp_path / "short.csv"
    sample.write_bytes(header + b"2026,2025,1\r\n")
    with pytest.raises(ValueError, match="שורה 2"):
        CsvValueOfUseRepo(sample, spec)
