"""Electric refund: the employee must see exactly +netBonus in net pay ("gross-up").

The employer pays a taxable amount G large enough that, after income tax, national insurance and health
at the employee's marginal rates, net pay rises by netBonus. Marginal rates differ per employee, so G is
found by search, never assumed:

1. Bracket: start at hi = netBonus and double until the net gain reaches the target. If it never does
   (e.g. rules with a 100% marginal rate), raise GrossUpUnsolvable - an explicit error, never a number.
2. Binary-search the bracket in whole agorot for a G whose net gain reaches the target, then step down
   agora by agora while it still does. Nets are rounded per component, so the gain is not perfectly
   monotone; the step-down guarantees the smallest qualifying G near the solution. A sweep over many
   salaries (tests/unit/test_engine.py) checks the gain stays within one agora of the target.
"""

from dataclasses import replace
from decimal import Decimal

from strauss.config.schema import Rules
from strauss.domain.models import Deductions, NetBreakdown, SalaryInput
from strauss.domain.net import Scenario, compute_net, compute_net_amount
from strauss.domain.tax import ZERO

AGORA = Decimal("0.01")
MAX_DOUBLINGS = 20


class GrossUpUnsolvable(Exception):
    """No gross amount within reach yields the required net bonus under these rules."""


def solve_gross_up(salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules) -> Decimal:
    """Smallest gross amount (in agorot) that raises net pay by rules.electric.net_bonus."""
    target = rules.electric.net_bonus
    if target <= ZERO:
        return ZERO
    base = replace(scenario, electric_gross_up=ZERO)  # never stack a refund on a previous one
    base_net = compute_net_amount(salary, deductions, base, rules)

    def gain(gross_up: Decimal) -> Decimal:
        with_bonus = replace(base, electric_gross_up=gross_up)
        return compute_net_amount(salary, deductions, with_bonus, rules) - base_net

    upper = target
    for _ in range(MAX_DOUBLINGS):
        if gain(upper) >= target:
            break
        upper *= 2
    else:
        raise GrossUpUnsolvable(f"לא נמצא גילום שמביא {target} ₪ נטו (נבדק עד {upper} ₪ ברוטו)")

    low, high = 0, int(upper / AGORA)  # in agorot; gain(high) >= target
    while low < high:
        middle = (low + high) // 2
        if gain(middle * AGORA) >= target:
            high = middle
        else:
            low = middle + 1
    while high > 0 and gain((high - 1) * AGORA) >= target:
        high -= 1
    return high * AGORA


def compute_net_with_electric(
    salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules
) -> NetBreakdown:
    """Net for an electric-car scenario, adding the refund the way the rules say (gross_up or gross)."""
    if rules.electric.method == "gross":
        refund = rules.electric.net_bonus
    else:
        refund = solve_gross_up(salary, deductions, scenario, rules)
    return compute_net(salary, deductions, replace(scenario, electric_gross_up=refund), rules)
