"""The rules schema accepts the real config and rejects broken ones with a clear message."""

from collections.abc import Callable
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from strauss.config.loader import CONFIG_DIR, bundle_from_dir, hash_dir, load_bundle
from strauss.domain.models import Drive
from tests.conftest import ConfigEditor


def test_real_config_loads_with_exact_decimal_values() -> None:
    rules = load_bundle().rules
    assert [g.code for g in rules.groups] == ["א", "ב", "ג", "ד"]
    assert rules.budget("ג") == Decimal("4500")
    assert rules.net_method.brackets[0].rate == Decimal("0.1")  # Decimal, not a float approximation
    assert rules.net_method.brackets[-1].up_to is None
    assert rules.net_method.pension_credit.max_contribution_rate == Decimal("0.07")
    assert rules.electric.drives == [Drive.ELECTRIC]
    assert rules.value_of_use.drive_field["3"] == Drive.ELECTRIC  # the header says otherwise; data rules


def test_group_rank_orders_low_to_high_and_rejects_unknown() -> None:
    rules = load_bundle().rules
    assert [rules.group_rank(c) for c in ["א", "ב", "ג", "ד"]] == [0, 1, 2, 3]
    with pytest.raises(KeyError):
        rules.group_rank("ה")


def test_hash_ignores_formatting(config_copy: ConfigEditor) -> None:
    reformatted = config_copy("rules.json", lambda _: None)  # rewritten compactly, same content
    assert hash_dir(reformatted) == hash_dir(CONFIG_DIR)


def test_hash_changes_when_a_rule_changes(config_copy: ConfigEditor) -> None:
    changed = config_copy("rules.json", lambda r: r["groups"][0].update(budget=3600))
    assert hash_dir(changed) != hash_dir(CONFIG_DIR)


def _set(path: list[str | int], value: Any) -> Callable[[Any], None]:
    def mutate(data: Any) -> None:
        for part in path[:-1]:
            data = data[part]
        data[path[-1]] = value

    return mutate


BROKEN_RULES = [
    pytest.param(_set(["netMethod", "brackets", 2, 0], 9000), "לעלות", id="brackets-not-ascending"),
    pytest.param(_set(["netMethod", "brackets", 6, 0], 99999), "פתוחה", id="last-bracket-closed"),
    pytest.param(_set(["netMethod", "brackets", 1, 0], None), "פתוחה", id="open-bracket-in-middle"),
    pytest.param(_set(["netMethod", "brackets", 0, 1], 1.5), "less than or equal to 1", id="rate-above-1"),
    pytest.param(_set(["groups", 1, "code"], "א"), "ייחודיים", id="duplicate-group"),
    pytest.param(_set(["chooseFrom"], "anything_goes"), "own_or_lower", id="unknown-choose-from"),
    pytest.param(_set(["electric", "netBonus"], -250), "greater than or equal to 0", id="negative-bonus"),
    pytest.param(_set(["netMethod", "health", "ceiling"], 5000), "התקרה", id="ceiling-below-threshold"),
    pytest.param(_set(["specialTracks", 0, "catalogGroup"], "ג"), "מתנגשת", id="track-clashes-group"),
    pytest.param(_set(["valueOfUse", "driveField", "3"], "DIESEL"), "ELECTRIC", id="unknown-drive"),
    pytest.param(lambda r: r.pop("waiver"), "waiver", id="missing-section"),
    pytest.param(_set(["electric", "typo"], 1), "Extra inputs", id="unknown-field"),
    pytest.param(
        _set(["payroll", "pensionableComponents"], ["base", "commissions", "base"]),
        "פעמיים",
        id="duplicate-salary-component",
    ),
    pytest.param(_set(["groups", 0, "budget"], -3500), "greater than 0", id="negative-budget"),
    pytest.param(_set(["effectiveFrom"], "2026-02-30"), "effectiveFrom", id="impossible-date"),
]


@pytest.mark.parametrize(("mutate", "expected"), BROKEN_RULES)
def test_broken_rules_are_rejected_with_a_clear_message(
    config_copy: ConfigEditor, mutate: Callable[[Any], None], expected: str
) -> None:
    directory: Path = config_copy("rules.json", mutate)
    with pytest.raises(ValidationError) as error:
        bundle_from_dir(directory)
    assert expected in str(error.value)


def test_broken_catalog_code_is_rejected(config_copy: ConfigEditor) -> None:
    directory = config_copy("catalog.json", lambda cars: cars[0].update(makerCode="885"))
    with pytest.raises(ValidationError, match="makerCode"):
        bundle_from_dir(directory)
