"""The agent's tools. Each one does real work with the engine and the data, records itself in the turn's
trace, and returns a summary in WORDS to the model. The calculation's money results (net, tax, delta,
value of use, gross-up) never go back to the model: they travel to the screen inside cards (OptionsCard,
ComparisonCard), so the model cannot repeat a wrong one. Rule texts may quote config amounts (a budget in
an eligibility reason) and vehicle candidates carry years and codes - those come from the data as-is.
"""

import difflib
import functools
from collections.abc import Callable
from decimal import Decimal, InvalidOperation
from typing import Any

from pydantic import ValidationError
from pydantic_ai import ModelRetry, RunContext

from strauss.agent.deps import AgentDeps, RepRequest
from strauss.agent.schemas import ComparisonCard, MissingCard, OptionsCard
from strauss.domain.compare import IncompleteProfile, UnknownOption
from strauss.domain.compare import compare as run_compare
from strauss.domain.eligibility import check_eligibility as run_eligibility
from strauss.domain.missing import missing_fields, rep_question
from strauss.domain.models import (
    CarArrangement,
    Comparison,
    Deductions,
    Drive,
    OptionResult,
    ParticipationStatus,
    Profile,
    SalaryInput,
    Vehicle,
    VehicleKey,
    WaiverArrangement,
)
from strauss.domain.options import build_options

SEARCH_LIMIT = 5
SEARCH_POOL = 200  # variants looked through to find the catalog's or the payslip's one
# Personal amounts are saved, not displayed: the 'show AI actions' timeline is visible on screen.
REDACTED = "(נשמר)"
PERSONAL_ARGS = frozenset(
    {"base_salary", "commissions", "bonus", "pension_pct", "study_fund_pct", "credit_points",
     "current_participation", "participation"}
)  # fmt: skip
DRIVE_HE = {
    Drive.PETROL: "בנזין",
    Drive.HYBRID: "היברידי",
    Drive.PLUG_IN: "פלאג-אין",
    Drive.ELECTRIC: "חשמלי",
}


def traced[**P, R](func: Callable[P, R]) -> Callable[P, R]:
    """Record the call and its (number-free) result in the turn's trace - the 'show AI actions' timeline."""

    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        ctx = args[0]
        assert isinstance(ctx, RunContext)
        deps: AgentDeps = ctx.deps
        given = {k: v for k, v in kwargs.items() if v is not None and v is not False}  # skip unset flags
        shown = {k: REDACTED if k in PERSONAL_ARGS else v for k, v in given.items()}
        deps.turn.event("tool_call", func.__name__, shown)
        try:
            result = func(*args, **kwargs)
        except ModelRetry as retry:
            deps.turn.event("tool_result", func.__name__, {"retry": str(retry)})
            raise
        deps.turn.event("tool_result", func.__name__, {"summary": _summary(result)})
        return result

    return wrapper


def _summary(result: Any) -> str:
    text = result if isinstance(result, str) else str(result)
    return text if len(text) <= 300 else text[:297] + "..."


def _decimal(value: float | str | None, field: str) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation as exc:
        raise ModelRetry(f"{field}: not a number ({value!r})") from exc


def _missing_text(profile: Profile) -> list[str]:
    return [m.question for m in missing_fields(profile)]


# ── Profile ──────────────────────────────────────────────────────────────────


@traced
def update_profile(
    ctx: RunContext[AgentDeps],
    occupation: str | None = None,
    base_salary: float | None = None,
    commissions: float | None = None,
    bonus: float | None = None,
    pension_pct: float | None = None,
    study_fund_pct: float | None = None,
    credit_points: float | None = None,
    children_under_23: int | None = None,
    current_participation: float | None = None,
    current_is_waiver: bool | None = None,
    occupation_not_in_list: bool = False,
) -> dict[str, Any]:
    """Save what the employee just told you. Pass only the fields they gave.

    Args:
        occupation: The occupation exactly as written in the occupations list of the conversation state.
        base_salary: Monthly base salary, gross, in shekels.
        commissions: Monthly commissions, in shekels (0 if none).
        bonus: Monthly bonus, in shekels (0 if none).
        pension_pct: Employee pension contribution in percent (e.g. 6). Save together with credit_points.
        study_fund_pct: Employee study-fund contribution in percent (0 if none).
        credit_points: Tax credit points (e.g. 2.25). Save together with pension_pct.
        children_under_23: Number of children up to the age in the conversation state.
        current_participation: What the employee pays today per month for their current car, in shekels.
        current_is_waiver: True if the employee has no company car today and receives car maintenance.
        occupation_not_in_list: True only after checking with the employee that their occupation really is
            none of the listed ones - it then goes to the transport rep.
    """
    deps = ctx.deps
    profile = deps.profile
    changes: dict[str, Any] = {}
    try:
        if occupation is not None:
            names = [o.name for o in deps.bundle.occupations]
            name = occupation.strip()
            if name not in names and not occupation_not_in_list:
                close = difflib.get_close_matches(name, names, n=3, cutoff=0.4)
                raise ModelRetry(
                    f"'{name}' is not in the occupations list. Use the exact listed name"
                    + (f" - closest: {close}" if close else "")
                    + ". If the employee's occupation truly isn't listed, "
                    + "call again with occupation_not_in_list=true."
                )
            changes["occupation"] = name
        if base_salary is not None or commissions is not None or bonus is not None:
            current = profile.salary
            if base_salary is None and current is None:
                raise ModelRetry("base_salary is required the first time salary is saved - ask for it")
            base = _decimal(base_salary, "base_salary")
            commission_amount = _decimal(commissions, "commissions")
            bonus_amount = _decimal(bonus, "bonus")
            changes["salary"] = SalaryInput(
                base=base if base is not None else current.base,  # type: ignore[union-attr]
                commissions=commission_amount
                if commission_amount is not None
                else (current.commissions if current else Decimal(0)),
                bonus=bonus_amount
                if bonus_amount is not None
                else (current.bonus if current else Decimal(0)),
            )
        if pension_pct is not None or credit_points is not None or study_fund_pct is not None:
            known = profile.deductions
            pension = (
                _decimal(pension_pct, "pension_pct")
                if pension_pct is not None
                else (known and known.pension_pct)
            )
            points = (
                _decimal(credit_points, "credit_points")
                if credit_points is not None
                else (known and known.credit_points)
            )
            if pension is None or points is None:
                raise ModelRetry(
                    "pension_pct and credit_points are saved together - ask for the one that is missing"
                )
            study = (
                _decimal(study_fund_pct, "study_fund_pct")
                if study_fund_pct is not None
                else (known.study_fund_pct if known else Decimal(0))
            )
            changes["deductions"] = Deductions(
                pension_pct=pension, study_fund_pct=study, credit_points=points
            )
        if children_under_23 is not None:
            changes["children_under_23"] = children_under_23
        if current_is_waiver:
            occupation_name = changes.get("occupation") or profile.occupation
            known_occupation = next((o for o in deps.bundle.occupations if o.name == occupation_name), None)
            if known_occupation is None:
                raise ModelRetry(
                    "save the occupation (from the occupations list) before a waiver arrangement"
                )
            changes["current"] = WaiverArrangement(maintenance=known_occupation.maintenance)
        if current_participation is not None:
            car = changes.get("current", profile.current)
            if not isinstance(car, CarArrangement):
                raise ModelRetry("set the current car with set_current_car before its participation")
            changes["current"] = car.model_copy(
                update={
                    "participation": _decimal(current_participation, "current_participation"),
                    "participation_status": ParticipationStatus.CONFIRMED,
                }
            )
        updated = Profile.model_validate({**profile.model_dump(), **{k: v for k, v in changes.items()}})
    except ValidationError as exc:
        raise ModelRetry(f"invalid value: {exc.errors()[0]['msg']} - ask the employee again") from exc
    deps.profile = updated
    deps.turn.profile_changed = True
    return {"saved": sorted(changes), "still_missing": _missing_text(updated)}


# ── Vehicles ─────────────────────────────────────────────────────────────────


@traced
def find_vehicle(
    ctx: RunContext[AgentDeps],
    query: str,
    reg_year: int | None = None,
    payslip_value_of_use: float | None = None,
) -> dict[str, Any]:
    """Find the employee's current car in the Tax Authority data by name (and registration year if known).

    One model name often has many variants with different values. Company cars come from the company
    catalog, so a variant that is in the catalog is returned first. Otherwise the 'שווי שימוש' line on the
    employee's payslip pins down the exact variant.

    Args:
        query: The model name as in the Tax Authority data: commercial names are in English ("corolla
            cross", "atto 3"), maker names in Hebrew ("טויוטה"). Translate Hebrew model names to English.
        reg_year: Registration year, if the employee said it.
        payslip_value_of_use: The monthly value of use printed on the employee's payslip, if they gave it.
    """
    deps = ctx.deps
    tax_year = deps.bundle.rules.value_of_use.tax_year
    found = deps.value_of_use.search(query, tax_year, reg_year, SEARCH_POOL)
    if not found:
        return {
            "candidates": [],
            "hint": "nothing found - try the English model name, or the maker in Hebrew",
        }
    in_catalog = _catalog_matches(deps, query, reg_year)  # looked up directly, not within the pool
    hint = "show the candidates in words (no codes) and save the chosen one with set_current_car"
    if payslip_value_of_use is not None:
        payslip = _decimal(payslip_value_of_use, "payslip_value_of_use")
        found = [v for v in found if v.value_of_use == payslip]
        if not found:
            return {
                "candidates": [],
                "hint": "no variant has that value of use - check the payslip line, the year and the name",
            }
    elif in_catalog:
        found = in_catalog
        hint = "in the company catalog, so most likely the employee's car - confirm with them, then save"
    if len(found) > SEARCH_LIMIT:
        names = sorted({v.commercial_name for v in found})
        return {
            "too_many": True,
            "names": names[:8],
            "hint": "several names: ask which one. One name with many variants: ask for the value of use "
            "(שווי שימוש) printed on the payslip and search again with payslip_value_of_use",
        }
    return {
        "candidates": [
            {
                "name": v.commercial_name,
                "maker": v.maker_name,
                "reg_year": v.key.reg_year,
                "drive": DRIVE_HE[v.drive],
                "key": v.key.model_dump(),
            }
            for v in found
        ],
        "hint": hint,
    }


def _catalog_matches(deps: AgentDeps, query: str, reg_year: int | None) -> list[Vehicle]:
    """Catalog cars matching the search the way the repository does, re-read from the data by full key."""
    needle = " ".join(query.split()).casefold()
    tax_year = deps.bundle.rules.value_of_use.tax_year
    found: list[Vehicle] = []
    for car in deps.bundle.catalog:
        if reg_year is not None and car.reg_year != reg_year:
            continue
        if needle not in car.commercial_name.casefold() and needle not in car.maker_name.casefold():
            continue
        key = VehicleKey(
            tax_year=tax_year,
            reg_year=car.reg_year,
            vehicle_type_code=car.vehicle_type_code,
            maker_code=car.maker_code,
            model_code=car.model_code,
        )
        vehicle = deps.value_of_use.get(key)
        if vehicle is not None:
            found.append(vehicle)
    return found


@traced
def set_current_car(
    ctx: RunContext[AgentDeps],
    reg_year: int,
    vehicle_type_code: int,
    maker_code: str,
    model_code: str,
    participation: float | None = None,
) -> dict[str, Any]:
    """Save the employee's current car, using the key of the candidate they chose from find_vehicle.

    Args:
        reg_year: From the chosen candidate's key.
        vehicle_type_code: From the chosen candidate's key.
        maker_code: From the chosen candidate's key.
        model_code: From the chosen candidate's key.
        participation: What the employee pays today per month for this car, if they said it.
    """
    deps = ctx.deps
    tax_year = deps.bundle.rules.value_of_use.tax_year
    key = VehicleKey(
        tax_year=tax_year,
        reg_year=reg_year,
        vehicle_type_code=vehicle_type_code,
        maker_code=maker_code,
        model_code=model_code,
    )
    vehicle = deps.value_of_use.get(key)
    if vehicle is None:
        raise ModelRetry("this key is not in the Tax Authority data - use a key returned by find_vehicle")
    catalog_id = next(
        (
            c.id
            for c in deps.bundle.catalog
            if (c.maker_code, c.model_code, c.reg_year, c.vehicle_type_code)
            == (maker_code, model_code, reg_year, vehicle_type_code)
        ),
        None,
    )
    amount = _decimal(participation, "participation")
    deps.profile = deps.profile.model_copy(
        update={
            "current": CarArrangement(
                vehicle=vehicle,
                catalog_id=catalog_id,
                participation=amount,
                participation_status=ParticipationStatus.CONFIRMED
                if amount is not None
                else ParticipationStatus.UNKNOWN,
            )
        }
    )
    deps.turn.profile_changed = True
    return {"saved": f"{vehicle.commercial_name} ({reg_year})", "still_missing": _missing_text(deps.profile)}


# ── Options, eligibility, comparison ─────────────────────────────────────────


def _describe(result: OptionResult) -> dict[str, Any]:
    """A result in words only."""
    item: dict[str, Any] = {"id": result.option.id, "label": result.option.label}
    if not result.eligibility.eligible:
        item["eligible"] = False
        item["reason"] = result.eligibility.reason
        return item
    item["eligible"] = True
    if result.delta is None:
        item["status"] = "waiting for data"
        item["missing"] = [m.question for m in result.missing]
        item["ask_rep_field"] = [m.field for m in result.missing if m.ask == "rep"]
        return item
    item["net_change"] = "up" if result.delta > 0 else "down" if result.delta < 0 else "no change"
    if result.participation_status == ParticipationStatus.DEFAULT_PENDING:
        item["participation"] = "default - waiting for the transport rep to confirm"
        item["ask_rep_field"] = f"participation:{result.option.id}"
    return item


def _run(deps: AgentDeps, option_ids: list[str] | None) -> Comparison | dict[str, Any]:
    try:
        return run_compare(deps.profile, deps.bundle, option_ids)
    except IncompleteProfile as missing:
        deps.turn.cards.append(MissingCard(missing=missing.missing))
        return {
            "incomplete": True,
            "ask": [m.question for m in missing.missing if m.ask == "employee"],
            "ask_rep_field": [m.field for m in missing.missing if m.ask == "rep"],
        }
    except UnknownOption as unknown:
        raise ModelRetry(f"unknown option ids: {unknown} - use ids from list_options") from unknown


@traced
def list_options(ctx: RunContext[AgentDeps]) -> dict[str, Any]:
    """Show the employee every alternative they may choose, ranked by net impact. The numbers appear on
    the employee's screen in a card; you get the ranking and reasons in words."""
    outcome = _run(ctx.deps, None)
    if not isinstance(outcome, Comparison):
        return outcome
    ctx.deps.turn.cards.append(OptionsCard(comparison=outcome))
    best = next((r.option.label for r in outcome.results if r.option.id == outcome.best_option_id), None)
    return {"shown_to_employee": True, "best": best, "options": [_describe(r) for r in outcome.results]}


@traced
def compare(ctx: RunContext[AgentDeps], option_ids: list[str]) -> dict[str, Any]:
    """Compare today's arrangement with the alternatives the employee asked about. The full comparison
    (numbers, chart, explanation) appears on the employee's screen in a card. When a compared car's
    participation is still the catalog default, the transport rep is asked automatically.

    Args:
        option_ids: Option ids from the conversation state: "waiver" or catalog car ids such as "CAR-10".
    """
    deps = ctx.deps
    outcome = _run(deps, option_ids)
    if not isinstance(outcome, Comparison):
        return outcome
    deps.turn.cards.append(ComparisonCard(comparison=outcome))
    described = [_describe(r) for r in outcome.results]
    for item in described:  # the employee asked about this car - the company must confirm its participation
        field = item.pop("ask_rep_field", None)
        if isinstance(field, str) and _send_to_rep(deps, field):
            item["participation"] = "default - the transport rep was asked to confirm; say so"
    return {"shown_to_employee": True, "results": described}


@traced
def check_eligibility(ctx: RunContext[AgentDeps], option_id: str) -> dict[str, Any]:
    """Whether the employee may choose an option, and why - before comparing it.

    Args:
        option_id: "waiver" or a catalog car id such as "CAR-14".
    """
    deps = ctx.deps
    option = next((o for o in build_options(deps.profile, deps.bundle) if o.id == option_id), None)
    if option is None:
        raise ModelRetry(f"{option_id} is not an alternative for this employee - use ids from list_options")
    eligibility = run_eligibility(deps.profile, option, deps.bundle)
    return {"option": option.label, "eligible": eligibility.eligible, "reason": eligibility.reason}


@traced
def ask_representative(ctx: RunContext[AgentDeps], field: str) -> dict[str, Any]:
    """Ask the transport rep for a fact only the company knows. Use the field a tool gave you in
    'ask_rep_field' (e.g. "participation:CAR-10"), or "occupation" for an occupation that isn't in the list.
    Tell the employee you asked; the answer arrives later.

    Args:
        field: Which fact is missing.
    """
    deps = ctx.deps
    if any(r.field == field for r in deps.turn.rep_requests):
        return {"sent": False, "already_asked": True}
    if not _send_to_rep(deps, field):
        raise ModelRetry(
            f"'{field}' is not something the rep is asked about - use an 'ask_rep_field' a tool returned, "
            "or 'occupation' for an occupation that is not in the list"
        )
    return {
        "sent": True,
        "tell_employee": "the transport rep was asked; the comparison updates when they answer",
    }


def _send_to_rep(deps: AgentDeps, field: str) -> bool:
    """Queue a rep question for this turn (the service opens it). False if there is nothing to ask."""
    if any(r.field == field for r in deps.turn.rep_requests):
        return True
    asked = _rep_question(field, deps)
    if asked is None:
        return False
    question, requested_car = asked
    profile = deps.profile
    context = {"occupation": profile.occupation or "", "group": profile.group or ""}
    if requested_car:
        context["requested_car"] = requested_car
    if isinstance(profile.current, CarArrangement):
        context["current_car"] = (
            f"{profile.current.vehicle.commercial_name} ({profile.current.vehicle.key.reg_year})"
        )
    deps.turn.rep_requests.append(RepRequest(field=field, question=question, context=context))
    return True


def _rep_question(field: str, deps: AgentDeps) -> tuple[str, str | None] | None:
    """(question, the car it is about) from a fixed template, never from the model - so it can't carry
    salary. None if the rep has nothing to answer for this field."""
    profile = deps.profile
    if field.startswith("participation:"):
        # Only for an option the employee may take whose participation the company hasn't confirmed yet
        try:
            (result,) = run_compare(profile, deps.bundle, [field.removeprefix("participation:")]).results
        except (IncompleteProfile, UnknownOption):
            return None
        pending = result.participation_status == ParticipationStatus.DEFAULT_PENDING or any(
            m.field == field for m in result.missing
        )
        if not (result.eligibility.eligible and pending):
            return None
        return rep_question(field, "participation", car=result.option.label).question, result.option.label
    listed = {o.name for o in deps.bundle.occupations}
    if field == "occupation" and profile.occupation and profile.occupation not in listed:
        return rep_question(field, "occupation.confirm", occupation=profile.occupation).question, None
    return None


TOOLS = (
    update_profile,
    find_vehicle,
    set_current_car,
    list_options,
    compare,
    check_eligibility,
    ask_representative,
)
