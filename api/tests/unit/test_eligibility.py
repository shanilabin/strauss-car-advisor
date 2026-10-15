"""Eligibility: the reference sheet's six cases (verdict and wording), every reason code, and the
edge scenarios from PLAN.md (waiver in group ב, mandatory car, higher group, too few children)."""

import re
from typing import Any

import pytest

from strauss.config.bundle import ConfigBundle
from strauss.config.loader import load_bundle, load_sample_employees, read_reference_results
from strauss.domain.eligibility import check_eligibility
from strauss.domain.models import Option, OptionKind, Profile

BUNDLE = load_bundle()
WAIVER = Option(id="waiver", kind=OptionKind.WAIVER, label="ויתור על הרכב")


def car(catalog_id: str) -> Option:
    return Option(id=catalog_id, kind=OptionKind.CATALOG_CAR, label=catalog_id, catalog_id=catalog_id)


def by_name(name: str) -> Option:
    return car(next(c.id for c in BUNDLE.catalog if c.commercial_name == name))


def profile(occupation: str | None, children: int | None = 0, group: str | None = None) -> Profile:
    return Profile(occupation=occupation, group=group, children_under_23=children)


def with_rules(**changes: Any) -> ConfigBundle:
    return ConfigBundle(
        rules=BUNDLE.rules.model_copy(update=changes),
        catalog=BUNDLE.catalog,
        occupations=BUNDLE.occupations,
        config_hash=BUNDLE.config_hash,
    )


# ── The reference sheet: verdict and exact wording ───────────────────────────

EMPLOYEES = {e.id: e for e in load_sample_employees()}
REFERENCE = [(r["employeeId"], r) for r in read_reference_results()]


@pytest.mark.parametrize(("employee_id", "ref"), REFERENCE, ids=[r[0] for r in REFERENCE])
def test_reference_alternatives_are_eligible_with_the_sheets_reason(
    employee_id: str, ref: dict[str, Any]
) -> None:
    employee = EMPLOYEES[employee_id]
    person = profile(employee.occupation, employee.children_under_23, employee.group)
    label = ref["alternative"]
    option = WAIVER if label.startswith("ויתור") else by_name(re.sub(r"\s*\(\d{4}\)$", "", label))
    result = check_eligibility(person, option, BUNDLE)
    assert result.eligible is ref["eligible"]
    assert result.reason == ref["reason"]


# ── Groups and budget ────────────────────────────────────────────────────────


def test_lower_and_own_group_cars_are_allowed() -> None:
    manager = profile("מנהל/ת מוצר")  # group ג
    for name in ("PICANTO", "NIRO", "ATTO 3"):  # groups א, ב, ג
        assert check_eligibility(manager, by_name(name), BUNDLE).reason_code == "OK_OWN_OR_LOWER"


def test_higher_group_is_not_allowed_and_says_why() -> None:
    """Edge scenario 3: a group ג employee asks for a Tesla (group ד)."""
    result = check_eligibility(profile("מנהל/ת מוצר"), by_name("MODEL 3"), BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "HIGHER_GROUP")
    assert result.reason == "הרכב מקבוצה ד, גבוהה מהקבוצה שלך (ג)"


def test_own_only_rule_rejects_lower_groups() -> None:
    rules = with_rules(choose_from="own_only")
    assert check_eligibility(profile("מנהל/ת מוצר"), by_name("PICANTO"), rules).reason_code == "OTHER_GROUP"
    assert check_eligibility(profile("מנהל/ת מוצר"), by_name("ATTO 3"), rules).reason_code == "OK_OWN_GROUP"


def test_any_rule_allows_higher_groups_but_budget_still_applies() -> None:
    rules = with_rules(choose_from="any")
    assert check_eligibility(profile("מנהל/ת מחלקה"), by_name("PICANTO"), rules).reason_code == "OK_ANY_GROUP"
    result = check_eligibility(profile("רכז/ת רכש"), by_name("SEAL"), rules)  # group א, 5,200 > 3,500
    assert result.reason_code == "OVER_BUDGET"
    assert result.reason == "עלות הרכב (5,200 ₪) גבוהה מתקציב הקבוצה שלך (3,500 ₪)"


def test_budget_is_not_enforced_when_the_rules_say_so() -> None:
    rules = with_rules(choose_from="any", enforce_budget=False)
    assert check_eligibility(profile("רכז/ת רכש"), by_name("SEAL"), rules).eligible


# ── Special track (family) ───────────────────────────────────────────────────


def test_family_track_ignores_group_and_budget() -> None:
    """David is group ב (budget 3,700) and may still take the Carnival (6,000) with five children."""
    result = check_eligibility(profile("נציג/ת מכירות שטח", children=5), by_name("CARNIVAL"), BUNDLE)
    assert (result.eligible, result.reason_code) == (True, "TRACK_OK")


def test_family_track_needs_enough_children() -> None:
    """Edge scenario 4: three children ask for the Carnival."""
    result = check_eligibility(profile("מנהל/ת אזור מכירות", children=3), by_name("CARNIVAL"), BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "TRACK_MIN_CHILDREN")
    assert result.reason == "מסלול ברוכת ילדים מיועד למי שיש לו לפחות 4 ילדים עד גיל 23"


def test_family_track_asks_when_children_are_unknown() -> None:
    result = check_eligibility(profile("מנהל/ת מוצר", children=None), by_name("SANTA FE"), BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "MISSING_INFO")
    assert result.params == {"fields": "children_under_23"}


def test_children_are_not_needed_for_regular_cars() -> None:
    assert check_eligibility(profile("מנהל/ת מוצר", children=None), by_name("ATTO 3"), BUNDLE).eligible


# ── Waiver ───────────────────────────────────────────────────────────────────


def test_group_b_developer_may_waive() -> None:
    """Edge scenario 1 - the challenge's explicit tip: a group ב employee who wants to waive."""
    result = check_eligibility(profile("מפתח/ת תוכנה"), WAIVER, BUNDLE)
    assert (result.eligible, result.reason_code) == (True, "WAIVER_OK")


def test_field_sales_cannot_waive_a_mandatory_car() -> None:
    """Edge scenario 2: field sales (group ב) - the car is mandatory."""
    result = check_eligibility(profile("נציג/ת מכירות שטח"), WAIVER, BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "CAR_REQUIRED")
    assert "חובה" in result.reason


def test_waiver_not_allowed_without_being_mandatory() -> None:
    occupations = tuple(
        o.model_copy(update={"waiver_allowed": False}) if o.name == "מפתח/ת תוכנה" else o
        for o in BUNDLE.occupations
    )
    bundle = ConfigBundle(BUNDLE.rules, BUNDLE.catalog, occupations, BUNDLE.config_hash)
    assert check_eligibility(profile("מפתח/ת תוכנה"), WAIVER, bundle).reason_code == "WAIVER_NOT_ALLOWED"


# ── Occupation and group ─────────────────────────────────────────────────────


def test_missing_occupation_is_asked_not_assumed() -> None:
    result = check_eligibility(profile(None), by_name("PICANTO"), BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "MISSING_INFO")
    assert result.reason == "חסר מידע: העיסוק"


def test_unknown_occupation_goes_to_the_rep() -> None:
    result = check_eligibility(profile("אסטרונאוט/ית"), by_name("PICANTO"), BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "UNKNOWN_OCCUPATION")


def test_stated_group_that_contradicts_the_occupation_goes_to_the_rep() -> None:
    """The group comes from the occupation; claiming a higher one is never taken at face value."""
    result = check_eligibility(profile("מפתח/ת תוכנה", group="ד"), by_name("MODEL 3"), BUNDLE)
    assert (result.eligible, result.reason_code) == (False, "OCCUPATION_GROUP_MISMATCH")
    assert result.params["occupation_group"] == "ב"


def test_every_reason_code_has_a_template_and_every_result_has_text() -> None:
    from strauss.domain.explain import REASONS

    for occupation in [o.name for o in BUNDLE.occupations]:
        for option in [WAIVER, *[car(c.id) for c in BUNDLE.catalog]]:
            result = check_eligibility(profile(occupation, children=4), option, BUNDLE)
            assert result.reason_code in REASONS and result.reason
