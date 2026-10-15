"""Property-based tests (Hypothesis): rules that must hold for ANY employee, not only the six samples.

Each property is checked on randomly generated profiles - salaries from minimum wage to the top bracket,
any pension/study-fund rates and credit points, every occupation, car and arrangement. When Hypothesis
finds a counter-example it shrinks it to the smallest failing case.

Hypothesis profiles live in tests/conftest.py: derandomized in CI (no flakiness), exploring locally.
"""

from decimal import Decimal

from hypothesis import assume, given, settings
from hypothesis import strategies as st

from strauss.config.loader import load_bundle
from strauss.config.models import CatalogCar, Occupation
from strauss.domain.compare import compare
from strauss.domain.eligibility import check_eligibility
from strauss.domain.gross_up import compute_net_with_electric, solve_gross_up
from strauss.domain.models import (
    CarArrangement,
    Deductions,
    Option,
    OptionKind,
    ParticipationStatus,
    Profile,
    SalaryInput,
    WaiverArrangement,
)
from strauss.domain.net import Scenario, compute_net
from strauss.domain.options import vehicle_from_catalog

BUNDLE = load_bundle()
RULES = BUNDLE.rules
TOLERANCE = Decimal("0.000001")


def money(low: int, high: int) -> st.SearchStrategy[Decimal]:
    """Whole agorot between low and high shekels."""
    return st.integers(low * 100, high * 100).map(lambda agorot: Decimal(agorot) / 100)


def steps(low: str, high: str, step: str) -> st.SearchStrategy[Decimal]:
    count = int((Decimal(high) - Decimal(low)) / Decimal(step))
    return st.integers(0, count).map(lambda i: Decimal(low) + i * Decimal(step))


salaries = st.builds(
    SalaryInput,
    base=money(3_000, 120_000),
    commissions=st.one_of(st.just(Decimal(0)), money(0, 20_000)),
    bonus=st.one_of(st.just(Decimal(0)), money(0, 20_000)),
)
deductions = st.builds(
    Deductions,
    pension_pct=steps("0", "10", "0.5"),
    study_fund_pct=steps("0", "7.5", "0.5"),
    credit_points=steps("0", "12", "0.25"),
)
car_scenarios = st.builds(
    Scenario,
    value_of_use=money(0, 12_000),
    participation=money(0, 1_500),
    track_employee_share=st.one_of(st.just(Decimal(0)), money(0, 2_000)),
)
waiver_scenarios = st.builds(Scenario, maintenance=money(0, 4_000))
scenarios = st.one_of(car_scenarios, waiver_scenarios)


# ── Net engine ───────────────────────────────────────────────────────────────


@settings(max_examples=1000)
@given(salaries, deductions, scenarios)
def test_breakdown_always_adds_up_and_nothing_is_negative(
    pay: SalaryInput, cuts: Deductions, scenario: Scenario
) -> None:
    result = compute_net(pay, cuts, scenario, RULES)
    deducted = (
        result.income_tax
        + result.national_insurance
        + result.health
        + result.pension
        + result.study_fund
        + result.participation
        + result.track_employee_share
    )
    assert result.gross_cash - deducted == result.net  # exact: no rounding during the calculation
    for field in ("income_tax", "national_insurance", "health", "pension", "study_fund"):
        assert getattr(result, field) >= 0, field


@settings(max_examples=1000)
@given(salaries, deductions, scenarios, money(1, 5_000))
def test_more_salary_never_means_less_net(
    pay: SalaryInput, cuts: Deductions, scenario: Scenario, raise_by: Decimal
) -> None:
    richer = pay.model_copy(update={"base": pay.base + raise_by})
    assert compute_net(richer, cuts, scenario, RULES).net >= compute_net(pay, cuts, scenario, RULES).net


@settings(max_examples=1000)
@given(salaries, deductions, car_scenarios, money(1, 3_000))
def test_a_higher_value_of_use_never_means_more_net(
    pay: SalaryInput, cuts: Deductions, scenario: Scenario, extra: Decimal
) -> None:
    pricier = Scenario(
        value_of_use=scenario.value_of_use + extra,
        participation=scenario.participation,
        track_employee_share=scenario.track_employee_share,
    )
    assert compute_net(pay, cuts, pricier, RULES).net <= compute_net(pay, cuts, scenario, RULES).net


@settings(max_examples=1000)
@given(salaries, deductions, car_scenarios, money(0, 1_000))
def test_participation_comes_off_net_shekel_for_shekel_and_never_touches_tax(
    pay: SalaryInput, cuts: Deductions, scenario: Scenario, more: Decimal
) -> None:
    base = compute_net(pay, cuts, scenario, RULES)
    paying_more = compute_net(
        pay,
        cuts,
        Scenario(
            value_of_use=scenario.value_of_use,
            participation=scenario.participation + more,
            track_employee_share=scenario.track_employee_share,
        ),
        RULES,
    )
    assert base.net - paying_more.net == more
    assert paying_more.income_tax == base.income_tax


@settings(max_examples=1000)
@given(salaries, deductions, car_scenarios)
def test_the_electric_refund_is_always_exactly_the_net_bonus(
    pay: SalaryInput, cuts: Deductions, scenario: Scenario
) -> None:
    without = compute_net(pay, cuts, scenario, RULES).net
    with_refund = compute_net_with_electric(pay, cuts, scenario, RULES)
    assert abs((with_refund.net - without) - RULES.electric.net_bonus) <= TOLERANCE
    assert with_refund.electric_gross_up >= RULES.electric.net_bonus  # never cheaper than the net amount


@settings(max_examples=500)
@given(salaries, deductions, car_scenarios)
def test_the_engine_is_deterministic(pay: SalaryInput, cuts: Deductions, scenario: Scenario) -> None:
    assert solve_gross_up(pay, cuts, scenario, RULES) == solve_gross_up(pay, cuts, scenario, RULES)
    assert compute_net(pay, cuts, scenario, RULES) == compute_net(pay, cuts, scenario, RULES)


# ── Eligibility ──────────────────────────────────────────────────────────────

occupations = st.sampled_from(BUNDLE.occupations)
catalog_cars = st.sampled_from(BUNDLE.catalog)


@settings(max_examples=1000)
@given(occupations, catalog_cars, st.integers(0, 8))
def test_a_regular_car_from_a_higher_group_is_never_allowed(
    occupation: Occupation, car: CatalogCar, children: int
) -> None:
    assume(car.group in [g.code for g in RULES.groups])  # special-track cars follow their own rules
    option = Option(id=car.id, kind=OptionKind.CATALOG_CAR, label=car.id, catalog_id=car.id)
    result = check_eligibility(
        Profile(occupation=occupation.name, children_under_23=children), option, BUNDLE
    )
    higher = RULES.group_rank(car.group) > RULES.group_rank(occupation.group)
    over_budget = car.monthly_cost > RULES.budget(occupation.group)
    assert result.eligible == (not higher and not over_budget)


@settings(max_examples=500)
@given(occupations, st.integers(0, 8))
def test_waiver_follows_the_occupation_table(occupation: Occupation, children: int) -> None:
    waiver = Option(id="waiver", kind=OptionKind.WAIVER, label="ויתור")
    result = check_eligibility(
        Profile(occupation=occupation.name, children_under_23=children), waiver, BUNDLE
    )
    assert result.eligible == (occupation.waiver_allowed and not occupation.car_required)
    if occupation.car_required:
        assert result.reason_code == "CAR_REQUIRED"


# ── Full comparison for random employees ─────────────────────────────────────


@st.composite
def employees(draw: st.DrawFn) -> Profile:
    occupation = draw(occupations)
    if occupation.waiver_allowed and draw(st.booleans()):
        current: CarArrangement | WaiverArrangement = WaiverArrangement(maintenance=occupation.maintenance)
    else:
        car = draw(catalog_cars)
        current = CarArrangement(
            vehicle=vehicle_from_catalog(car, RULES.value_of_use.tax_year),
            catalog_id=car.id,
            participation=draw(money(0, 1_000)),
            participation_status=ParticipationStatus.CONFIRMED,
        )
    return Profile(
        occupation=occupation.name,
        salary=draw(salaries),
        deductions=draw(deductions),
        children_under_23=draw(st.integers(0, 8)),
        current=current,
    )


@settings(max_examples=200)
@given(employees())
def test_every_comparison_adds_up_on_screen(profile: Profile) -> None:
    """For any employee and every option: today + delta = option, the waterfall sums to the delta and
    ends on the option's net, ineligible options show no numbers, and the best option is the top one."""
    comparison = compare(profile, BUNDLE)
    for result in comparison.results:
        if not result.eligibility.eligible:
            assert result.delta is None and result.breakdown is None and result.net_option is None
            continue
        assert result.net_today is not None and result.net_option is not None and result.delta is not None
        assert result.net_today + result.delta == result.net_option
        assert sum((s.delta for s in result.waterfall), Decimal(0)) == result.delta
        if result.waterfall:
            assert result.waterfall[-1].net_after == result.net_option
        assert len(result.explanation) == 2
    computed = [r for r in comparison.results if r.delta is not None]
    if computed:
        assert comparison.best_option_id == computed[0].option.id
        assert [r.delta for r in computed] == sorted((r.delta for r in computed), reverse=True)


@settings(max_examples=100)
@given(employees())
def test_the_same_profile_always_gives_the_same_comparison(profile: Profile) -> None:
    first = compare(profile, BUNDLE, comparison_id="x")
    second = compare(profile, BUNDLE, comparison_id="x")
    assert first == second
