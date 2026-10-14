"""The engine reproduces the challenge's reference sheet ('חישובים'): 6 employees x today/alternative x
(net, income tax, national insurance + health) = 36 numbers, plus the electric gross-up and family-track
share. Scenarios are built only from the config files (sample employees, catalog, occupations, rules).
"""

import re
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import pytest

from strauss.config.loader import load_bundle, load_sample_employees, read_reference_results
from strauss.config.models import CatalogCar, SampleCurrentCar, SampleEmployee
from strauss.domain.gross_up import compute_net_with_electric
from strauss.domain.models import NetBreakdown
from strauss.domain.net import Scenario, compute_net

BUNDLE = load_bundle()
RULES = BUNDLE.rules
EMPLOYEES = {e.id: e for e in load_sample_employees()}
REFERENCE = read_reference_results()


def shekels(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def _car(label: str) -> CatalogCar:
    name = re.sub(r"\s*\(\d{4}\)\s*$", "", label).strip()
    return next(c for c in BUNDLE.catalog if c.commercial_name == name)


def _car_scenario(employee: SampleEmployee, car: CatalogCar, participation: Decimal) -> Scenario:
    track = next((t for t in RULES.special_tracks if t.catalog_group == car.group), None)
    share = Decimal(0)
    if track is not None:
        gap = max(car.monthly_cost - RULES.budget(employee.group), Decimal(0))
        share = gap * track.gap_split_employee
    return Scenario(value_of_use=car.value_of_use, participation=participation, track_employee_share=share)


def _net(employee: SampleEmployee, scenario: Scenario, car: CatalogCar | None) -> NetBreakdown:
    electric = car is not None and car.drive in RULES.electric.drives
    compute = compute_net_with_electric if electric else compute_net
    return compute(employee.salary, employee.deductions.to_domain(), scenario, RULES)


def today(employee: SampleEmployee) -> NetBreakdown:
    current = employee.current
    if isinstance(current, SampleCurrentCar):
        car = BUNDLE.catalog_car(current.catalog_id)
        return _net(employee, _car_scenario(employee, car, current.participation), car)
    return _net(employee, Scenario(maintenance=current.maintenance), None)


def alternative(employee: SampleEmployee, label: str) -> NetBreakdown:
    if label.startswith("ויתור"):
        maintenance = BUNDLE.occupation(employee.occupation).maintenance
        return _net(employee, Scenario(maintenance=maintenance), None)
    car = _car(label)
    return _net(employee, _car_scenario(employee, car, car.default_participation), car)


CASES = [(r["employeeId"], r) for r in REFERENCE]


@pytest.mark.parametrize(("employee_id", "ref"), CASES, ids=[c[0] for c in CASES])
def test_net_tax_and_insurance_match_the_reference_sheet(employee_id: str, ref: dict[str, Any]) -> None:
    employee = EMPLOYEES[employee_id]
    now, alt = today(employee), alternative(employee, ref["alternative"])
    actual = {
        "netToday": shekels(now.net),
        "netAlternative": shekels(alt.net),
        "taxToday": shekels(now.income_tax),
        "taxAlternative": shekels(alt.income_tax),
        "insuranceToday": shekels(now.national_insurance + now.health),
        "insuranceAlternative": shekels(alt.national_insurance + alt.health),
    }
    expected = {key: ref[key] for key in actual}
    assert actual == expected


@pytest.mark.parametrize(("employee_id", "ref"), CASES, ids=[c[0] for c in CASES])
def test_gross_up_track_share_and_delta_match(employee_id: str, ref: dict[str, Any]) -> None:
    employee = EMPLOYEES[employee_id]
    now, alt = today(employee), alternative(employee, ref["alternative"])
    assert shekels(alt.electric_gross_up) == ref["electricGrossUp"]
    assert shekels(alt.track_employee_share) == ref["trackEmployeeShare"]
    # The delta is taken between the displayed (whole-shekel) nets, like the reference sheet
    assert shekels(alt.net) - shekels(now.net) == ref["delta"]


def test_all_36_reference_numbers_are_covered() -> None:
    fields = [
        "netToday",
        "netAlternative",
        "taxToday",
        "taxAlternative",
        "insuranceToday",
        "insuranceAlternative",
    ]
    assert len(REFERENCE) * len(fields) == 36
