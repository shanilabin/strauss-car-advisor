"""The comparison reproduces the challenge's reference sheet ('חישובים') end to end: each sample employee's
profile goes through the real compare() - eligibility, options, scenario building and the net engine -
and must give the sheet's 36 numbers (net, income tax, insurance; today and alternative), plus the
electric gross-up, the family-track share, the delta and the eligibility reason.
"""

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import pytest

from strauss.config.loader import load_bundle, load_sample_employees, read_reference_results
from strauss.config.samples import to_profile
from strauss.domain.compare import compare
from strauss.domain.models import OptionResult

BUNDLE = load_bundle()
EMPLOYEES = {e.id: e for e in load_sample_employees()}
CASES = [(r["employeeId"], r) for r in read_reference_results()]


def shekels(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def option_id(label: str) -> str:
    if label.startswith("ויתור"):
        return "waiver"
    name = re.sub(r"\s*\(\d{4}\)\s*$", "", label).strip()
    return next(c.id for c in BUNDLE.catalog if c.commercial_name == name)


def run(employee_id: str, ref: dict[str, Any]) -> tuple[Any, OptionResult]:
    comparison = compare(to_profile(EMPLOYEES[employee_id], BUNDLE), BUNDLE, [option_id(ref["alternative"])])
    (result,) = comparison.results
    return comparison, result


@pytest.mark.parametrize(("employee_id", "ref"), CASES, ids=[c[0] for c in CASES])
def test_the_36_reference_numbers(employee_id: str, ref: dict[str, Any]) -> None:
    comparison, result = run(employee_id, ref)
    today, alt = comparison.today, result.breakdown
    assert alt is not None
    actual = {
        "netToday": shekels(today.net),
        "netAlternative": shekels(alt.net),
        "taxToday": shekels(today.income_tax),
        "taxAlternative": shekels(alt.income_tax),
        "insuranceToday": shekels(today.national_insurance + today.health),
        "insuranceAlternative": shekels(alt.national_insurance + alt.health),
    }
    assert actual == {key: ref[key] for key in actual}


@pytest.mark.parametrize(("employee_id", "ref"), CASES, ids=[c[0] for c in CASES])
def test_headline_numbers_gross_up_share_and_reason(employee_id: str, ref: dict[str, Any]) -> None:
    _, result = run(employee_id, ref)
    assert result.breakdown is not None
    assert (result.net_today, result.net_option, result.delta) == (
        ref["netToday"],
        ref["netAlternative"],
        ref["delta"],
    )
    assert shekels(result.breakdown.electric_gross_up) == ref["electricGrossUp"]
    assert shekels(result.breakdown.track_employee_share) == ref["trackEmployeeShare"]
    assert result.eligibility.eligible is ref["eligible"]
    assert result.eligibility.reason == ref["reason"]


def test_all_36_reference_numbers_are_covered() -> None:
    fields = ["netToday", "netAlternative", "taxToday", "taxAlternative", "insuranceToday"]
    assert len(CASES) * len([*fields, "insuranceAlternative"]) == 36
