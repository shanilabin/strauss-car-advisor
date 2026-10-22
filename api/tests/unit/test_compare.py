"""compare(): options, ranking, what is shown for ineligible/incomplete options, the waterfall and the
two-line explanation - over all six sample employees and the edge cases."""

from decimal import Decimal
from typing import Any

import pytest

from strauss.config.bundle import ConfigBundle
from strauss.config.loader import load_bundle, load_sample_employees
from strauss.config.samples import to_profile
from strauss.domain.compare import IncompleteProfile, UnknownOption, compare, rerun
from strauss.domain.explain import MINUS
from strauss.domain.models import (
    CarArrangement,
    Comparison,
    ParticipationStatus,
    Profile,
    SalaryInput,
    WaiverArrangement,
)
from strauss.domain.options import vehicle_from_catalog

BUNDLE = load_bundle()
EMPLOYEES = {e.id: e for e in load_sample_employees()}


def sample(employee_id: str) -> Profile:
    return to_profile(EMPLOYEES[employee_id], BUNDLE)


def full(employee_id: str, bundle: ConfigBundle = BUNDLE) -> Comparison:
    return compare(sample(employee_id), bundle, comparison_id="test")


def result(comparison: Comparison, option_id: str) -> Any:
    return next(r for r in comparison.results if r.option.id == option_id)


def with_rules(**changes: Any) -> ConfigBundle:
    return ConfigBundle(
        BUNDLE.rules.model_copy(update=changes), BUNDLE.catalog, BUNDLE.occupations, BUNDLE.config_hash
    )


# ── Options ──────────────────────────────────────────────────────────────────


def test_todays_car_is_the_baseline_not_an_option() -> None:
    noa = full("E-001")  # drives CAR-09 (Corolla Cross)
    ids = [r.option.id for r in noa.results]
    assert "CAR-09" not in ids and "waiver" in ids
    assert len(ids) == len(BUNDLE.catalog)  # 19 other cars + waiver


def test_an_employee_on_maintenance_is_not_offered_a_waiver_again() -> None:
    rachel = full("E-003")
    assert "waiver" not in [r.option.id for r in rachel.results]


def test_ranking_best_first_and_ineligible_last() -> None:
    noa = full("E-001")
    computed = [r for r in noa.results if r.delta is not None]
    rest = [r for r in noa.results if r.delta is None]
    assert noa.results == computed + rest
    assert [r.delta for r in computed] == sorted((r.delta for r in computed), reverse=True)
    assert noa.best_option_id == computed[0].option.id == "waiver"


def test_noa_sees_her_14_options_13_cars_plus_waiver() -> None:
    noa = full("E-001")
    eligible = [r for r in noa.results if r.eligibility.eligible]
    assert len(eligible) == 13  # groups א-ג except her own car, plus the waiver


def test_ineligible_options_carry_a_reason_but_no_numbers() -> None:
    tesla = result(full("E-001"), "CAR-14")
    assert tesla.eligibility.reason_code == "HIGHER_GROUP"
    assert tesla.explanation == [tesla.eligibility.reason]
    for field in ("breakdown", "net_today", "net_option", "delta", "cost_to_company", "value_of_use"):
        assert getattr(tesla, field) is None, field
    assert tesla.waterfall == []


def test_unknown_option_id_is_rejected() -> None:
    with pytest.raises(UnknownOption):
        compare(sample("E-001"), BUNDLE, ["CAR-99"])
    with pytest.raises(UnknownOption):
        compare(sample("E-001"), BUNDLE, ["CAR-09"])  # her own car is not an option


# ── What is shown: every requirement-23 field ────────────────────────────────


def test_a_computed_option_has_every_field_the_challenge_requires() -> None:
    atto = result(full("E-001"), "CAR-10")
    assert atto.option.label == "ATTO 3 (2025)"
    assert atto.eligibility.eligible and atto.eligibility.reason
    assert (atto.cost_to_company, atto.group_budget) == (Decimal(4100), Decimal(4500))
    assert (atto.participation, atto.participation_status) == (
        Decimal(300),
        ParticipationStatus.DEFAULT_PENDING,
    )
    assert atto.value_of_use == Decimal(3130)
    assert atto.electric_refund_net == Decimal(250)
    assert (atto.net_today, atto.net_option, atto.delta) == (Decimal(11032), Decimal(11693), Decimal(661))
    assert len(atto.explanation) == 2
    assert {s.field for s in atto.sources} >= {
        "value_of_use",
        "cost_to_company",
        "group_budget",
        "participation",
    }


def test_waiver_shows_maintenance_and_no_car_fields() -> None:
    waiver = result(full("E-005"), "waiver")  # Michal: reference sheet +3,562
    assert waiver.maintenance == Decimal(2000) and waiver.cost_to_company == Decimal(2000)
    assert waiver.value_of_use is None and waiver.participation is None
    assert waiver.delta == Decimal(3562)


def test_noa_explanation_in_plain_hebrew() -> None:
    atto = result(full("E-001"), "CAR-10")
    assert atto.explanation == [
        "שווי השימוש יורד מ-4,070 ל-3,130 ₪ בחודש, ולכן המס שלך יורד.",
        "בנוסף מקבלים החזר חשמל של 250 ₪ נטו. ביחד: +661 ₪ בחודש.",
    ]


def test_negative_delta_uses_a_real_minus_sign() -> None:
    mg4 = result(full("E-003"), "CAR-06")  # Rachel: maintenance -> MG4, reference -1,938
    assert mg4.delta == Decimal(-1938)
    assert f"ביחד: {MINUS}1,938 ₪ בחודש." in mg4.explanation[1]
    assert mg4.explanation[0].startswith("לרכב נוסף לשכר החייב במס שווי שימוש של 2,430")


# ── Waterfall ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("employee_id", sorted(EMPLOYEES))
def test_every_waterfall_adds_up_to_its_delta_and_lands_on_the_option(employee_id: str) -> None:
    for r in full(employee_id).results:
        if r.delta is None:
            continue
        assert sum((s.delta for s in r.waterfall), Decimal(0)) == r.delta, r.option.id
        if r.waterfall:
            assert r.waterfall[-1].net_after == r.net_option
        assert r.net_today + r.delta == r.net_option


def test_waterfall_steps_follow_the_documented_order() -> None:
    order = ["value_of_use", "maintenance", "electric_refund", "participation", "track_share"]
    for employee_id in EMPLOYEES:
        for r in full(employee_id).results:
            keys = [s.key for s in r.waterfall]
            assert keys == sorted(keys, key=order.index)


def test_noa_atto3_waterfall() -> None:
    steps = result(full("E-001"), "CAR-10").waterfall
    assert [(s.key, s.delta) for s in steps] == [("value_of_use", 411), ("electric_refund", 250)]


def test_family_track_waterfall_shows_the_employee_share() -> None:
    carnival = result(full("E-002"), "CAR-19")  # David, reference -3,522 with a 1,150 share
    assert carnival.delta == Decimal(-3522)
    assert "track_share" in [s.key for s in carnival.waterfall]
    assert "חלק העובד בפער של המסלול: 1,150" in carnival.explanation[1]


def test_leaving_an_electric_car_removes_the_refund() -> None:
    atto = BUNDLE.catalog_car("CAR-10")
    driver = sample("E-001").model_copy(
        update={
            "current": CarArrangement(
                vehicle=vehicle_from_catalog(atto, 2026),
                catalog_id="CAR-10",
                participation=Decimal(300),
                participation_status=ParticipationStatus.CONFIRMED,
            )
        }
    )
    picanto = result(compare(driver, BUNDLE), "CAR-01")
    step = next(s for s in picanto.waterfall if s.key == "electric_refund")
    assert step.label == "בלי החזר חשמל" and step.delta == Decimal(-250)
    assert "מוותרים על החזר החשמל" in picanto.explanation[1]


# ── Missing information ──────────────────────────────────────────────────────


def test_nothing_is_computed_while_the_profile_is_incomplete() -> None:
    with pytest.raises(IncompleteProfile) as error:
        compare(Profile(occupation="מנהל/ת מוצר"), BUNDLE)
    assert [m.field for m in error.value.missing] == ["salary.base", "deductions", "current"]
    assert all(m.ask == "employee" and m.question for m in error.value.missing)


def test_unknown_current_participation_is_asked() -> None:
    noa = sample("E-001")
    assert isinstance(noa.current, CarArrangement)
    unknown = noa.model_copy(update={"current": noa.current.model_copy(update={"participation": None})})
    with pytest.raises(IncompleteProfile) as error:
        compare(unknown, BUNDLE)
    assert [m.field for m in error.value.missing] == ["current.participation"]


def test_family_cars_ask_for_children_when_unknown() -> None:
    noa = sample("E-001").model_copy(update={"children_under_23": None})
    carnival = result(compare(noa, BUNDLE), "CAR-19")
    assert carnival.complete is False and carnival.delta is None
    assert carnival.missing[0].field == "children_under_23"
    assert "23" in carnival.missing[0].question  # the age comes from the rules


def test_rep_only_participation_shows_known_facts_and_computes_nothing() -> None:
    participation = BUNDLE.rules.participation.model_copy(update={"policy": "always_ask_rep"})
    atto = result(full("E-001", with_rules(participation=participation)), "CAR-10")
    assert atto.complete is False and atto.delta is None and atto.breakdown is None
    assert atto.missing[0].ask == "rep" and atto.missing[0].field == "participation:CAR-10"
    assert atto.cost_to_company == Decimal(4100) and atto.value_of_use == Decimal(3130)


def test_a_rep_confirmed_participation_replaces_the_default() -> None:
    noa = sample("E-001").model_copy(update={"confirmed_participation": {"CAR-10": Decimal(350)}})
    atto = result(compare(noa, BUNDLE), "CAR-10")
    assert (atto.participation, atto.participation_status) == (Decimal(350), ParticipationStatus.CONFIRMED)
    assert atto.delta == Decimal(611)  # 50 more participation, net only
    assert "השתתפות שאישר נציג התחבורה" in [s.label for s in atto.sources]


def test_comparison_records_how_it_was_computed() -> None:
    noa = full("E-001")
    assert (noa.context.payroll_tax_year, noa.context.value_of_use_tax_year) == (2025, 2026)
    assert noa.context.config_hash == BUNDLE.config_hash and noa.context.engine_version
    assert noa.profile_snapshot == sample("E-001")


def test_maintenance_employee_today_is_computed_without_a_car() -> None:
    rachel = full("E-003")
    assert isinstance(rachel.profile_snapshot.current, WaiverArrangement)
    assert rachel.today.maintenance == Decimal(1500) and rachel.today.value_of_use == 0


# ── Review follow-ups ────────────────────────────────────────────────────────


def test_unknown_occupation_goes_to_the_rep_instead_of_re_asking() -> None:
    stranger = sample("E-001").model_copy(update={"occupation": "אסטרונאוט/ית", "group": "ד"})
    comparison = compare(stranger, BUNDLE)  # today is still computed
    assert all(not r.eligibility.eligible for r in comparison.results)
    assert {r.eligibility.reason_code for r in comparison.results} == {"UNKNOWN_OCCUPATION"}


def test_unknown_occupation_with_a_family_car_today_asks_the_rep() -> None:
    david = sample("E-002")
    carnival = BUNDLE.catalog_car("CAR-19")
    on_track = david.model_copy(
        update={
            "occupation": "אסטרונאוט/ית",
            "current": CarArrangement(
                vehicle=vehicle_from_catalog(carnival, 2026),
                catalog_id="CAR-19",
                participation=Decimal(500),
                participation_status=ParticipationStatus.CONFIRMED,
            ),
        }
    )
    with pytest.raises(IncompleteProfile) as error:
        compare(on_track, BUNDLE)
    assert [(m.field, m.ask) for m in error.value.missing] == [("occupation", "rep")]


def test_eligible_but_waiting_options_come_before_ineligible_ones() -> None:
    participation = BUNDLE.rules.participation.model_copy(update={"policy": "always_ask_rep"})
    results = full("E-001", with_rules(participation=participation)).results
    groups = [(r.delta is None, not r.eligibility.eligible) for r in results]
    assert groups == sorted(groups)
    assert results[-1].eligibility.eligible is False


def test_gross_method_is_explained_as_gross() -> None:
    electric = BUNDLE.rules.electric.model_copy(update={"method": "gross"})
    atto = result(full("E-001", with_rules(electric=electric)), "CAR-10")
    assert "250 ₪ ברוטו (חייב במס)" in atto.explanation[1]
    assert atto.electric_refund_net is None


def test_ineligible_sources_point_at_the_deciding_rule() -> None:
    david = full("E-002")  # field sales: car required
    assert result(david, "waiver").sources[0].ref == "occupations[נציג/ת מכירות שטח]"
    noa = full("E-001")
    assert result(noa, "CAR-14").sources[0].ref == "rules.chooseFrom"


def test_leaving_the_family_track_is_explained() -> None:
    carnival = BUNDLE.catalog_car("CAR-19")
    on_track = sample("E-002").model_copy(
        update={
            "current": CarArrangement(
                vehicle=vehicle_from_catalog(carnival, 2026),
                catalog_id="CAR-19",
                participation=Decimal(500),
                participation_status=ParticipationStatus.CONFIRMED,
            )
        }
    )
    niro = result(compare(on_track, BUNDLE), "CAR-05")
    assert "בלי חלק העובד במסלול (1,150 ₪ היום)" in niro.explanation[1]


def test_rerun_keeps_the_alternatives_on_screen() -> None:
    bundle = load_bundle()
    noa = to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), bundle)
    richer = noa.model_copy(update={"salary": SalaryInput(base=noa.salary.base + 5000)})  # type: ignore[union-attr]

    one = rerun(compare(noa, bundle, ["CAR-10"]), richer, bundle)
    assert [r.option.id for r in one.results] == ["CAR-10"]
    assert one.profile_snapshot == richer

    every = compare(noa, bundle)
    assert {r.option.id for r in rerun(every, richer, bundle).results} == {r.option.id for r in every.results}


def test_the_best_option_is_measured_against_every_alternative_not_just_the_compared_ones() -> None:
    """QA B03: Yossi - the EV3 compared alone is not "the best for you" while the MG4 leaves more."""
    yossi = to_profile(next(e for e in load_sample_employees() if e.id == "E-004"), BUNDLE)
    ev3 = next(r.option.id for r in compare(yossi, BUNDLE).results if "EV3" in r.option.label)
    alone = compare(yossi, BUNDLE, [ev3])
    assert [r.option.id for r in alone.results] == [ev3]
    assert alone.best_option_id == "CAR-06"  # the MG4, not in this comparison


def test_when_nothing_beats_today_there_is_no_best_option() -> None:
    """QA UX02: Rachel - every alternative lowers her net, so staying as she is is the best."""
    rachel = full("E-003")
    assert all(r.delta < 0 for r in rachel.results if r.delta is not None)
    assert rachel.best_option_id is None


def test_noa_and_the_atto_3_break_even_at_the_participation_plus_the_gain() -> None:
    """ATTO 3 for Noa: +661 at a participation of 300 -> worth it up to 961 a month, not beyond."""
    noa = full("E-001")
    atto = next(r for r in noa.results if r.option.id == "CAR-10")
    assert (atto.participation, atto.delta, atto.break_even_participation) == (300, 661, 961)


def test_the_monthly_delta_is_added_up_over_the_projection_years() -> None:
    """ATTO 3 for Noa: +661 a month is +7,932 a year and +23,796 in three (rules.projection.years)."""
    atto = next(r for r in full("E-001").results if r.option.id == "CAR-10")
    assert [(p.years, p.amount) for p in atto.delta_over_years] == [(1, 7932), (3, 23796)]


def test_there_is_nothing_to_add_up_without_a_delta() -> None:
    comparison = full("E-001")
    assert all(r.delta_over_years == [] for r in comparison.results if r.delta is None)
    assert all(len(r.delta_over_years) == 2 for r in comparison.results if r.delta is not None)


def test_there_is_no_break_even_when_even_a_free_car_loses() -> None:
    """Rachel: every car lowers her net by more than its whole participation."""
    rachel = full("E-003")
    assert all(r.break_even_participation is None for r in rachel.results)


def test_a_waiver_has_no_break_even() -> None:
    waiver = next(r for r in full("E-001").results if r.option.id == "waiver")
    assert waiver.break_even_participation is None
