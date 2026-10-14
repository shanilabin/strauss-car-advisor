"""Cross-file checks: the config files agree with each other and with the Tax Authority data."""

from collections.abc import Callable
from typing import Any

import pytest

from strauss.adapters.csv_value_of_use import CsvValueOfUseRepo
from strauss.config.crosscheck import crosscheck
from strauss.config.loader import bundle_from_dir, load_bundle
from tests.conftest import ConfigEditor


def test_real_config_passes_every_check_against_the_tax_authority(tax_authority: CsvValueOfUseRepo) -> None:
    report = crosscheck(load_bundle(), tax_authority)
    assert report.ok, report.errors
    assert report.warnings == []
    assert report.stats == {"groups": 4, "catalog_cars": 20, "occupations": 14}


def test_without_tax_authority_data_the_check_is_skipped_with_a_warning() -> None:
    report = crosscheck(load_bundle())
    assert report.ok
    assert [w.code for w in report.warnings] == ["vou_not_checked"]


def _first(update: dict[str, Any]) -> Callable[[Any], None]:
    return lambda items: items[0].update(update)


def _by_name(name: str, update: dict[str, Any]) -> Callable[[Any], None]:
    return lambda items: next(i for i in items if i["name"] == name).update(update)


BROKEN = [
    pytest.param("catalog.json", _first({"group": "ה"}), "unknown_group", id="catalog-unknown-group"),
    pytest.param("occupations.json", _first({"group": "ה"}), "unknown_group", id="occupation-unknown-group"),
    pytest.param(
        "occupations.json",
        _by_name("נציג/ת מכירות שטח", {"waiverAllowed": True, "maintenance": 1500}),
        "required_but_waivable",
        id="required-and-waivable",
    ),
    pytest.param(
        "occupations.json",
        _by_name("מפתח/ת תוכנה", {"maintenance": 0}),
        "waiver_without_maintenance",
        id="waiver-without-maintenance",
    ),
    pytest.param("catalog.json", lambda cars: cars.append(cars[0]), "duplicate_catalog_id", id="dup-id"),
    pytest.param("catalog.json", _first({"modelCode": "99999"}), "not_in_tax_authority", id="unknown-key"),
    pytest.param("catalog.json", _first({"regYear": 2019}), "not_in_tax_authority", id="wrong-reg-year"),
    pytest.param("catalog.json", _first({"valueOfUse": 9999}), "value_of_use_mismatch", id="vou-mismatch"),
    pytest.param("catalog.json", _first({"drive": "ELECTRIC"}), "drive_mismatch", id="drive-mismatch"),
]


@pytest.mark.parametrize(("file", "mutate", "code"), BROKEN)
def test_broken_bundle_is_reported(
    config_copy: ConfigEditor,
    tax_authority: CsvValueOfUseRepo,
    file: str,
    mutate: Callable[[Any], None],
    code: str,
) -> None:
    report = crosscheck(bundle_from_dir(config_copy(file, mutate)), tax_authority)
    assert not report.ok
    assert code in {e.code for e in report.errors}
    assert all(e.message_he and e.path for e in report.errors)


def test_every_problem_is_reported_not_just_the_first(
    config_copy: ConfigEditor, tax_authority: CsvValueOfUseRepo
) -> None:
    def break_two_cars(cars: Any) -> None:
        cars[0]["valueOfUse"] = 1
        cars[1]["valueOfUse"] = 1

    report = crosscheck(bundle_from_dir(config_copy("catalog.json", break_two_cars)), tax_authority)
    assert len(report.errors) == 2


def test_car_costing_more_than_its_own_group_budget_is_flagged(config_copy: ConfigEditor) -> None:
    def overprice(cars: Any) -> None:
        next(c for c in cars if c["id"] == "CAR-09")["monthlyCost"] = 4800  # group ג budget is 4,500

    report = crosscheck(bundle_from_dir(config_copy("catalog.json", overprice)))
    assert "over_own_budget" in {w.code for w in report.warnings}
