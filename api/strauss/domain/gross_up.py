"""Electric refund: the employee must see exactly +netBonus in net pay ("gross-up").

The employer pays a taxable amount G large enough that, after income tax, national insurance and health
at the employee's marginal rates, net pay rises by netBonus. Marginal rates differ per employee, so G is
found by search, never assumed:

1. Bracket: start at hi = netBonus and double until the net gain reaches the target. If it never does
   (e.g. rules with a 100% marginal rate), raise GrossUpUnsolvable - an explicit error, never a number.
2. Bisect the bracket. The calculation is exact (no rounding, per rules.netMethod.rounding) and the gain
   is monotone in G (every marginal rate is below 100%), so bisection converges; it stops when the gain
   is within TOLERANCE of the target. The employee therefore sees exactly +netBonus, as the rules require.
"""

from dataclasses import replace
from decimal import Decimal

from strauss.config.schema import Rules
from strauss.domain.models import Deductions, NetBreakdown, SalaryInput
from strauss.domain.net import Scenario, compute_net, compute_net_amount
from strauss.domain.tax import ZERO

TOLERANCE = Decimal("0.000001")  # a millionth of a shekel
MAX_DOUBLINGS = 20
MAX_BISECTIONS = 200


class GrossUpUnsolvable(Exception):
    """No gross amount within reach yields the required net bonus under these rules."""


def solve_gross_up(salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules) -> Decimal:
    """Gross amount that raises net pay by exactly rules.electric.net_bonus (within TOLERANCE)."""
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

    low, high = ZERO, upper  # gain(low) < target <= gain(high)
    for _ in range(MAX_BISECTIONS):
        middle = (low + high) / 2
        difference = gain(middle) - target
        if abs(difference) <= TOLERANCE:
            return middle
        if difference < ZERO:
            low = middle
        else:
            high = middle
    return high


def compute_net_with_electric(
    salary: SalaryInput, deductions: Deductions, scenario: Scenario, rules: Rules
) -> NetBreakdown:
    """Net for an electric-car scenario, adding the refund the way the rules say (gross_up or gross)."""
    if rules.electric.method == "gross":
        refund = rules.electric.net_bonus
    else:
        refund = solve_gross_up(salary, deductions, scenario, rules)
    return compute_net(salary, deductions, replace(scenario, electric_gross_up=refund), rules)
