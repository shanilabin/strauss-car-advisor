"""Monthly net pay for one scenario (today, or one alternative).

The formula is the one verified 36/36 against the challenge's reference sheet (GUIDE.md part C,
research/verify_reference.py). Every rate, limit and policy comes from the rules; nothing is hard-coded.

Rounding (rules.netMethod.rounding, published by the organizers): no rounding during the calculation -
every component and the net are exact Decimals, so net = gross - deductions exactly. Rounding happens
only for display: the API serializes money to agorot and headline nets are shown in whole shekels.
"""

from dataclasses import dataclass
from decimal import Decimal

from strauss.config.schema import Rules, SalaryComponent
from strauss.domain.models import Deductions, NetBreakdown, SalaryInput
from strauss.domain.tax import ZERO, bracket_tax, pension_credit, two_tier

HUNDRED = Decimal(100)


@dataclass(frozen=True)
class Scenario:
    """What changes between today and an alternative. Salary and deductions stay the same.

    A scenario is either a car (value of use, participation, track share, electric refund) or a waiver
    (maintenance) - never both.
    """

    value_of_use: Decimal = ZERO
    participation: Decimal = ZERO
    maintenance: Decimal = ZERO
    track_employee_share: Decimal = ZERO
    electric_gross_up: Decimal = ZERO

    def __post_init__(self) -> None:
        amounts = (
            self.value_of_use,
            self.participation,
            self.maintenance,
            self.track_employee_share,
            self.electric_gross_up,
        )
        if any(amount < ZERO for amount in amounts):
            raise ValueError("סכומי תרחיש לא יכולים להיות שליליים")
        car_parts = (self.value_of_use, self.participation, self.track_employee_share, self.electric_gross_up)
        if self.maintenance > ZERO and any(part > ZERO for part in car_parts):
            raise ValueError("תרחיש לא יכול לכלול גם רכב וגם אחזקת רכב")


def _components(salary: SalaryInput, names: list[SalaryComponent]) -> Decimal:
    values: dict[SalaryComponent, Decimal] = {
        "base": salary.base,
        "commissions": salary.commissions,
        "bonus": salary.bonus,
    }
    return sum((values[name] for name in names), ZERO)


def compute_net(
    salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules
) -> NetBreakdown:
    parts, net = _compute(salary, deductions, scenario, rules)
    return NetBreakdown(**parts, net=net)


def compute_net_amount(
    salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules
) -> Decimal:
    """Net only - for searches that evaluate many scenarios (gross-up) without building models."""
    return _compute(salary, deductions, scenario, rules)[1]


_DEDUCTIONS = (
    "income_tax",
    "national_insurance",
    "health",
    "pension",
    "study_fund",
    "participation",
    "track_employee_share",
)


def _compute(
    salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules
) -> tuple[dict[str, Decimal], Decimal]:
    payroll = rules.payroll
    method = rules.net_method
    salary_cash = salary.base + salary.commissions + salary.bonus
    gross_cash = salary_cash + scenario.maintenance + scenario.electric_gross_up

    pensionable = _components(salary, payroll.pensionable_components)
    if rules.waiver.maintenance_is_pensionable:
        pensionable += scenario.maintenance
    study_base = _components(salary, payroll.study_fund_components)
    if payroll.study_fund_ceiling is not None:
        study_base = min(study_base, payroll.study_fund_ceiling)

    pension = pensionable * deductions.pension_pct / HUNDRED
    study_fund = study_base * deductions.study_fund_pct / HUNDRED

    taxable_maintenance = scenario.maintenance if rules.waiver.maintenance_is_taxable else ZERO
    taxable = salary_cash + taxable_maintenance + scenario.electric_gross_up + scenario.value_of_use

    credits = deductions.credit_points * method.credit_point_value + pension_credit(
        pension, pensionable, method.pension_credit
    )
    income_tax = max(ZERO, bracket_tax(taxable, method.brackets) - credits)
    national_insurance = two_tier(taxable, method.national_insurance)
    health = two_tier(taxable, method.health)

    parts = {
        "gross_cash": gross_cash,
        "value_of_use": scenario.value_of_use,
        "taxable_income": taxable,
        "income_tax": income_tax,
        "national_insurance": national_insurance,
        "health": health,
        "pension": pension,
        "study_fund": study_fund,
        "participation": scenario.participation,
        "track_employee_share": scenario.track_employee_share,
        "electric_gross_up": scenario.electric_gross_up,
        "maintenance": scenario.maintenance,
    }
    net = parts["gross_cash"] - sum((parts[name] for name in _DEDUCTIONS), ZERO)
    return parts, net
