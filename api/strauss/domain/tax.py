"""Monthly tax building blocks. Pure functions over Decimal; all rates and limits come from the rules."""

from decimal import Decimal

from strauss.config.schema import Bracket, PensionCredit, TwoTier

ZERO = Decimal(0)


def bracket_tax(income: Decimal, brackets: list[Bracket]) -> Decimal:
    """Progressive tax: each slice of income is taxed at its own (marginal) rate."""
    tax = ZERO
    lower = ZERO
    for bracket in brackets:
        upper = income if bracket.up_to is None else min(income, bracket.up_to)
        if upper > lower:
            tax += (upper - lower) * bracket.rate
        if bracket.up_to is None or income <= bracket.up_to:
            break
        lower = bracket.up_to
    return tax


def two_tier(amount: Decimal, tier: TwoTier) -> Decimal:
    """National insurance / health: low rate to the threshold, high rate to the ceiling, none above."""
    capped = min(max(amount, ZERO), tier.ceiling)
    low_part = min(capped, tier.threshold)
    high_part = max(capped - tier.threshold, ZERO)
    return low_part * tier.low_rate + high_part * tier.high_rate


def pension_credit(pension: Decimal, pensionable: Decimal, rule: PensionCredit) -> Decimal:
    """Credit on the employee's pension contribution, up to maxContributionRate of the capped income.

    Verified against the reference sheet: 35% x min(pension, 7% x min(pensionable, 9,500)).
    """
    eligible_contribution = min(pension, rule.max_contribution_rate * min(pensionable, rule.income_ceiling))
    return rule.rate * eligible_contribution
