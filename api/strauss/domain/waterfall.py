"""Sequential attribution of the net difference (ARCHITECTURE.md, section 3).

Starting from today, one factor at a time is switched to the option's value, in a fixed, documented
order, and net pay is recomputed after each step. Each step's delta is the difference between the
displayed (whole-shekel) nets, so the steps add up to the headline delta exactly.

Because tax brackets are not linear, a step's size depends on the order - the UI labels the chart
"פירוק לפי סדר". Participation and the track share are net-only deductions, so the electric refund solved
for the final option is exact at its step too, and the last step lands exactly on the option's net.
"""

from dataclasses import replace
from decimal import Decimal

from strauss.config.schema import Rules
from strauss.domain.models import Deductions, SalaryInput, WaterfallKey, WaterfallStep
from strauss.domain.money import SHEKEL, round_money
from strauss.domain.net import Scenario, compute_net_amount

ORDER: tuple[WaterfallKey, ...] = (
    "value_of_use",
    "maintenance",
    "electric_refund",
    "participation",
    "track_share",
)
FIELD: dict[WaterfallKey, str] = {
    "value_of_use": "value_of_use",
    "maintenance": "maintenance",
    "electric_refund": "electric_gross_up",
    "participation": "participation",
    "track_share": "track_employee_share",
}


def shekel_net(amount: Decimal) -> Decimal:
    return round_money(amount, SHEKEL)


def _label(key: WaterfallKey, before: Decimal, after: Decimal) -> str:
    if key == "value_of_use":
        if after == 0:
            return "בלי שווי שימוש"
        if before == 0:
            return "נוסף שווי שימוש"
        return "שווי שימוש נמוך יותר" if after < before else "שווי שימוש גבוה יותר"
    if key == "maintenance":
        return "אחזקת רכב" if after > before else "בלי אחזקת רכב"
    if key == "electric_refund":
        return "החזר חשמל (מגולם)" if after > before else "בלי החזר חשמל"
    if key == "participation":
        if after == 0:
            return "בלי השתתפות"
        return "השתתפות נמוכה יותר" if after < before else "השתתפות גבוהה יותר"
    return "חלק העובד במסלול" if after > before else "בלי חלק במסלול"


def build_waterfall(
    salary: SalaryInput, deductions: Deductions, rules: Rules, today: Scenario, option: Scenario
) -> list[WaterfallStep]:
    """today/option include their electric gross-up. Steps for factors that don't change are omitted."""
    state = today
    shown = shekel_net(compute_net_amount(salary, deductions, state, rules))
    steps: list[WaterfallStep] = []
    for key in ORDER:
        field = FIELD[key]
        before, after = getattr(state, field), getattr(option, field)
        if before == after:
            continue
        state = replace(state, **{field: after})
        net_after = shekel_net(compute_net_amount(salary, deductions, state, rules))
        steps.append(
            WaterfallStep(
                key=key, label=_label(key, before, after), delta=net_after - shown, net_after=net_after
            )
        )
        shown = net_after
    if state != option:  # every factor was switched, so this would be a bug in ORDER/FIELD
        raise RuntimeError("waterfall did not reach the option scenario")
    return steps
