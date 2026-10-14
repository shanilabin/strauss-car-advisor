"""Unit and edge-case tests for the net engine - especially the cases the reference sheet doesn't cover
(low salaries, income above the insurance ceiling, the top bracket, credits larger than the tax)."""

from dataclasses import replace
from decimal import Decimal

import pytest

from strauss.config.loader import load_rules
from strauss.config.schema import Bracket, Rules
from strauss.domain.gross_up import GrossUpUnsolvable, compute_net_with_electric, solve_gross_up
from strauss.domain.models import Deductions, SalaryInput
from strauss.domain.net import Scenario, compute_net
from strauss.domain.tax import bracket_tax, pension_credit, two_tier

RULES = load_rules()
D = Decimal
NOA_DEDUCTIONS = Deductions(pension_pct=D(6), study_fund_pct=D("2.5"), credit_points=D("2.75"))


def salary(base: str, commissions: str = "0", bonus: str = "0") -> SalaryInput:
    return SalaryInput(base=D(base), commissions=D(commissions), bonus=D(bonus))


def with_rules(**changes: object) -> Rules:
    return RULES.model_copy(update=changes)


# ── Tax building blocks ──────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("income", "expected"),
    [
        ("0", "0"),
        ("5000", "500"),  # 10% only
        ("7010", "701"),  # exactly at the first boundary
        ("10060", "1128"),  # 701 + 3,050 x 14%
        ("22570", "4341.4"),  # Noa today: reaches the 35% slice by 130
    ],
)
def test_bracket_tax_is_progressive(income: str, expected: str) -> None:
    assert bracket_tax(D(income), RULES.net_method.brackets) == D(expected)


def test_bracket_tax_top_slice_is_open_ended() -> None:
    brackets = RULES.net_method.brackets
    assert bracket_tax(D(70130), brackets) - bracket_tax(D(60130), brackets) == D(5000)  # 50% of 10,000


def test_two_tier_low_rate_below_threshold_and_nothing_above_ceiling() -> None:
    ni = RULES.net_method.national_insurance
    assert two_tier(D(5000), ni) == D(5000) * ni.low_rate
    assert two_tier(D(60000), ni) == two_tier(ni.ceiling, ni)


def test_pension_credit_is_capped_at_seven_percent_of_capped_income() -> None:
    rule = RULES.net_method.pension_credit
    # High salary: cap = 7% x 9,500 = 665 -> credit 35% x 665
    assert pension_credit(D(1110), D(18500), rule) == D("232.75")
    # Low salary: 7% of the salary itself is the cap
    assert pension_credit(D(480), D(8000), rule) == D("0.35") * D(480)  # 6% x 8,000 < 7% x 8,000
    assert pension_credit(D(640), D(8000), rule) == D("0.35") * D(560)  # 8% x 8,000 capped at 7%


# ── Net ──────────────────────────────────────────────────────────────────────


def test_breakdown_adds_up_to_net() -> None:
    result = compute_net(
        salary("18500"), NOA_DEDUCTIONS, Scenario(value_of_use=D(4070), participation=D(300)), RULES
    )
    deductions = (
        result.income_tax
        + result.national_insurance
        + result.health
        + result.pension
        + result.study_fund
        + result.participation
        + result.track_employee_share
    )
    assert result.gross_cash - deductions == result.net  # exact: no rounding during the calculation
    assert result.net.quantize(D("0.01")) == D("11031.82")


def test_value_of_use_is_taxed_but_never_paid() -> None:
    without = compute_net(salary("18500"), NOA_DEDUCTIONS, Scenario(), RULES)
    with_car = compute_net(salary("18500"), NOA_DEDUCTIONS, Scenario(value_of_use=D(4070)), RULES)
    assert with_car.gross_cash == without.gross_cash
    assert with_car.taxable_income == without.taxable_income + D(4070)
    assert with_car.net < without.net


def test_maintenance_is_taxable_but_not_pensionable() -> None:
    result = compute_net(salary("21000"), NOA_DEDUCTIONS, Scenario(maintenance=D(1500)), RULES)
    assert result.pension == D(21000) * D("0.06")
    assert result.taxable_income == D(22500)


def test_maintenance_policy_comes_from_the_rules() -> None:
    waiver = RULES.waiver.model_copy(
        update={"maintenance_is_taxable": False, "maintenance_is_pensionable": True}
    )
    result = compute_net(
        salary("21000"), NOA_DEDUCTIONS, Scenario(maintenance=D(1500)), with_rules(waiver=waiver)
    )
    assert result.taxable_income == D(21000)
    assert result.pension == D(22500) * D("0.06")


def test_pension_and_study_fund_include_commissions_and_bonus() -> None:
    result = compute_net(salary("16000", commissions="3000"), NOA_DEDUCTIONS, Scenario(), RULES)
    assert result.pension == D(19000) * D("0.06")
    assert result.study_fund == D(19000) * D("0.025")


def test_study_fund_ceiling_applies_when_configured() -> None:
    payroll = RULES.payroll.model_copy(update={"study_fund_ceiling": D(15712)})
    result = compute_net(salary("32000"), NOA_DEDUCTIONS, Scenario(), with_rules(payroll=payroll))
    assert result.study_fund == D(15712) * D("0.025")


def test_income_tax_is_never_negative() -> None:
    many_points = Deductions(pension_pct=D(6), credit_points=D(10))
    result = compute_net(salary("6000"), many_points, Scenario(), RULES)
    assert result.income_tax == 0
    assert result.net > 0


def test_track_share_and_participation_are_net_deductions_only() -> None:
    base = compute_net(salary("12200"), NOA_DEDUCTIONS, Scenario(value_of_use=D(8120)), RULES)
    with_share = compute_net(
        salary("12200"), NOA_DEDUCTIONS, Scenario(value_of_use=D(8120), track_employee_share=D(1150)), RULES
    )
    assert with_share.income_tax == base.income_tax
    assert with_share.net == base.net - D(1150)


# ── Gross-up ─────────────────────────────────────────────────────────────────

EDGE_PROFILES = [
    pytest.param(salary("5300"), id="minimum-wage-no-tax"),
    pytest.param(salary("18500"), id="noa"),
    pytest.param(salary("48000"), id="47pct-and-above-insurance-ceiling"),
    pytest.param(salary("90000"), id="top-bracket-50pct"),
]


@pytest.mark.parametrize("pay", EDGE_PROFILES)
def test_gross_up_gives_exactly_the_net_bonus(pay: SalaryInput) -> None:
    scenario = Scenario(value_of_use=D(3130), participation=D(300))
    before = compute_net(pay, NOA_DEDUCTIONS, scenario, RULES).net
    after = compute_net_with_electric(pay, NOA_DEDUCTIONS, scenario, RULES).net
    assert abs((after - before) - RULES.electric.net_bonus) <= D("0.000001")  # exactly +250


def test_gross_up_for_noa_matches_the_marginal_rate() -> None:
    """Noa's marginal rate here is 31% tax + 7% + 5.17% insurance: G = 250 / (1 - 0.4317)."""
    scenario = Scenario(value_of_use=D(3130), participation=D(300))
    gross_up = solve_gross_up(salary("18500"), NOA_DEDUCTIONS, scenario, RULES)
    expected = D(250) / (1 - D("0.31") - D("0.07") - D("0.0517"))
    assert abs(gross_up - expected) < D("0.00001")


def test_gross_up_grows_with_the_marginal_rate() -> None:
    scenario = Scenario(value_of_use=D(3130))
    low = solve_gross_up(salary("9000"), NOA_DEDUCTIONS, scenario, RULES)
    high = solve_gross_up(salary("90000"), NOA_DEDUCTIONS, scenario, RULES)
    assert low < high


def test_gross_method_pays_the_bonus_as_gross() -> None:
    gross_rules = with_rules(electric=RULES.electric.model_copy(update={"method": "gross"}))
    result = compute_net_with_electric(
        salary("18500"), NOA_DEDUCTIONS, Scenario(value_of_use=D(3130)), gross_rules
    )
    assert result.electric_gross_up == D(250)


def test_unsolvable_gross_up_raises_instead_of_returning_a_number() -> None:
    confiscatory = RULES.net_method.model_copy(
        update={"brackets": [Bracket.model_validate({"upTo": None, "rate": 1})]}
    )
    with pytest.raises(GrossUpUnsolvable):
        solve_gross_up(salary("18500"), NOA_DEDUCTIONS, Scenario(), with_rules(net_method=confiscatory))


def test_gross_up_is_exact_across_a_salary_sweep() -> None:
    """The employee sees exactly +250 net at every salary, from minimum wage to the top bracket."""
    scenario = Scenario(value_of_use=D(3130), participation=D(300))
    for base in range(5000, 100001, 733):
        pay = salary(str(base))
        before = compute_net(pay, NOA_DEDUCTIONS, scenario, RULES).net
        gain = compute_net_with_electric(pay, NOA_DEDUCTIONS, scenario, RULES).net - before
        assert abs(gain - D(250)) <= D("0.000001"), base


def test_a_preset_refund_is_not_stacked() -> None:
    clean = Scenario(value_of_use=D(3130))
    preset = replace(clean, electric_gross_up=D(440))
    assert solve_gross_up(salary("18500"), NOA_DEDUCTIONS, preset, RULES) == solve_gross_up(
        salary("18500"), NOA_DEDUCTIONS, clean, RULES
    )


def test_a_scenario_cannot_mix_car_and_waiver() -> None:
    with pytest.raises(ValueError, match="גם רכב וגם אחזקת רכב"):
        Scenario(value_of_use=D(4070), maintenance=D(2000))
    with pytest.raises(ValueError, match="שליליים"):
        Scenario(participation=D(-1))
