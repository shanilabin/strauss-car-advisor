"""Today versus every alternative (or the chosen ones): the comparison the UI renders.

Pure: profile + config in, Comparison out. Every number comes from the net engine; every sentence from a
template. Headline nets are whole shekels and the delta is taken between them, so what the employee sees
always adds up (ARCHITECTURE.md, rounding policy).
"""

import uuid
from dataclasses import dataclass, replace
from decimal import Decimal

from strauss import ENGINE_VERSION
from strauss.config.bundle import ConfigBundle
from strauss.config.models import CatalogCar, Occupation
from strauss.domain.eligibility import check_eligibility, employee_group, track_of
from strauss.domain.explain import other_factors_line, participation_change, shekels, value_of_use_line
from strauss.domain.gross_up import compute_net_with_electric
from strauss.domain.missing import employee_question, missing_fields, rep_question
from strauss.domain.models import (
    CalculationContext,
    CarArrangement,
    Comparison,
    Deductions,
    Eligibility,
    MissingField,
    NetBreakdown,
    Option,
    OptionKind,
    OptionResult,
    ParticipationStatus,
    Profile,
    SalaryInput,
    Source,
    SourceKind,
    Vehicle,
)
from strauss.domain.net import Scenario, compute_net
from strauss.domain.options import build_options, car_label
from strauss.domain.waterfall import build_waterfall, shekel_net

ZERO = Decimal(0)


class IncompleteProfile(Exception):
    """The comparison can't be computed yet; `missing` says what to ask, and whom."""

    def __init__(self, missing: list[MissingField]) -> None:
        super().__init__(", ".join(m.field for m in missing))
        self.missing = missing


class UnknownOption(KeyError):
    """An option id that isn't an alternative for this employee."""


@dataclass(frozen=True)
class _Priced:
    """A real scenario, with the electric refund applied when the car is electric."""

    scenario: Scenario
    breakdown: NetBreakdown


def _pay(profile: Profile) -> tuple[SalaryInput, Deductions]:
    if profile.salary is None or profile.deductions is None:  # missing_fields() rules this out first
        raise IncompleteProfile(missing_fields(profile))
    return profile.salary, profile.deductions


def _price(profile: Profile, scenario: Scenario, electric: bool, bundle: ConfigBundle) -> _Priced:
    salary, deductions = _pay(profile)
    compute = compute_net_with_electric if electric else compute_net
    breakdown = compute(salary, deductions, scenario.ensure_real(), bundle.rules)
    return _Priced(replace(scenario, electric_gross_up=breakdown.electric_gross_up), breakdown)


def _track_share(
    car: CatalogCar | None, group: str | None, profile: Profile, bundle: ConfigBundle
) -> Decimal:
    """Employee's share of the cost above the group budget - only for special-track cars."""
    if car is None:
        return ZERO
    track = track_of(car, bundle)
    if track is None:
        return ZERO
    if group is None:  # the budget depends on a group we can't establish yet - the rep confirms it
        raise IncompleteProfile(
            [rep_question("occupation", "occupation.confirm", occupation=profile.occupation or "")]
        )
    return max(car.monthly_cost - bundle.rules.budget(group), ZERO) * track.gap_split_employee


def _is_electric(vehicle: Vehicle | CatalogCar, bundle: ConfigBundle) -> bool:
    return vehicle.drive in bundle.rules.electric.drives


def _today(profile: Profile, group: str | None, bundle: ConfigBundle) -> _Priced:
    current = profile.current
    if isinstance(current, CarArrangement):
        catalog_car = next((c for c in bundle.catalog if c.id == current.catalog_id), None)
        scenario = Scenario(
            value_of_use=current.vehicle.value_of_use,
            participation=current.participation or ZERO,
            track_employee_share=_track_share(catalog_car, group, profile, bundle),
        )
        return _price(profile, scenario, _is_electric(current.vehicle, bundle), bundle)
    if current is None:  # missing_fields() rules this out first
        raise IncompleteProfile(missing_fields(profile))
    return _price(profile, Scenario(maintenance=current.maintenance), False, bundle)


def _participation(
    profile: Profile, car: CatalogCar, bundle: ConfigBundle
) -> tuple[Decimal | None, ParticipationStatus]:
    if car.id in profile.confirmed_participation:
        return profile.confirmed_participation[car.id], ParticipationStatus.CONFIRMED
    policy = bundle.rules.participation.policy
    if policy == "default_confirmed":
        return car.default_participation, ParticipationStatus.CONFIRMED
    if policy == "default_pending_rep":
        return car.default_participation, ParticipationStatus.DEFAULT_PENDING
    return None, ParticipationStatus.UNKNOWN


def compare(
    profile: Profile,
    bundle: ConfigBundle,
    option_ids: list[str] | None = None,
    comparison_id: str | None = None,
) -> Comparison:
    missing = missing_fields(profile)
    if missing:
        raise IncompleteProfile(missing)
    # The group comes only from a known occupation - a stated group is never taken at face value.
    occupation, _ = employee_group(profile, bundle)
    group = occupation.group if occupation else None

    today = _today(profile, group, bundle)
    options = build_options(profile, bundle)
    if option_ids is not None:
        known = {o.id for o in options}
        unknown = [i for i in option_ids if i not in known]
        if unknown:
            raise UnknownOption(", ".join(unknown))
        options = [o for o in options if o.id in option_ids]

    results = [_option_result(profile, option, occupation, group, today, bundle) for option in options]
    # computed options best-first, then eligible ones still waiting for data, then ineligible ones;
    # sorted() is stable, so ties keep catalog order
    ranked = sorted(
        results,
        key=lambda r: (
            r.delta is None,
            not r.eligibility.eligible,
            -(r.delta if r.delta is not None else ZERO),
        ),
    )
    best = next((r.option.id for r in ranked if r.delta is not None and r.complete), None)
    rules = bundle.rules
    return Comparison(
        id=comparison_id or str(uuid.uuid4()),
        context=CalculationContext(
            payroll_tax_year=rules.net_method.tax_year,
            value_of_use_tax_year=rules.value_of_use.tax_year,
            config_version=rules.version,
            config_hash=bundle.config_hash,
            engine_version=ENGINE_VERSION,
        ),
        profile_snapshot=profile,
        today=today.breakdown,
        results=ranked,
        best_option_id=best,
    )


def _option_result(
    profile: Profile,
    option: Option,
    occupation: Occupation | None,
    group: str | None,
    today: _Priced,
    bundle: ConfigBundle,
) -> OptionResult:
    eligibility = check_eligibility(profile, option, bundle)
    if not eligibility.eligible:
        missing = []
        if eligibility.reason_code == "MISSING_INFO" and "children_under_23" in str(
            eligibility.params["fields"]
        ):
            track = next(t for t in bundle.rules.special_tracks if t.id == option.track_id)
            missing.append(employee_question("children_under_23", max_age=track.requires.child_max_age))
        return OptionResult(
            option=option,
            eligibility=eligibility,
            complete=not missing,
            missing=missing,
            explanation=[eligibility.reason],
            sources=[_eligibility_source(eligibility, option, profile, group)],
        )

    if group is None:  # eligibility passes only for a known occupation, which always has a group
        raise RuntimeError("eligible option without an eligibility group")
    rules = bundle.rules
    budget = rules.budget(group)
    budget_source = Source(
        field="group_budget",
        kind=SourceKind.CONFIG,
        label=f"תקציב קבוצה {group}",
        ref=f"rules.groups[{group}].budget",
    )

    if option.kind == OptionKind.WAIVER:
        if occupation is None:  # an eligible waiver always has a known occupation
            raise RuntimeError("eligible waiver without an occupation")
        option_side = _price(profile, Scenario(maintenance=occupation.maintenance), False, bundle)
        return _computed(
            option,
            eligibility,
            today,
            option_side,
            profile,
            bundle,
            cost_to_company=occupation.maintenance,
            group_budget=budget,
            maintenance=occupation.maintenance,
            sources=[
                Source(
                    field="maintenance",
                    kind=SourceKind.CONFIG,
                    label="אחזקת רכב לפי עיסוק",
                    ref=f"occupations[{occupation.name}].maintenance",
                ),
                budget_source,
            ],
        )

    if option.catalog_id is None:
        raise RuntimeError(f"option {option.id} has no catalog car")
    car = bundle.catalog_car(option.catalog_id)
    participation, status = _participation(profile, car, bundle)
    car_sources = [
        Source(
            field="value_of_use",
            kind=SourceKind.VALUE_OF_USE_DB,
            label=f"מאגר שווי שימוש {rules.value_of_use.tax_year}, רשות המסים",
            ref=f"{rules.value_of_use.tax_year}/{car.reg_year}/{car.vehicle_type_code}/{car.maker_code}/{car.model_code}",
        ),
        Source(
            field="cost_to_company",
            kind=SourceKind.CONFIG,
            label="עלות חודשית לחברה",
            ref=f"catalog[{car.id}].monthlyCost",
        ),
        budget_source,
    ]
    if participation is None:  # only the rep knows - show what's known, compute nothing
        return OptionResult(
            option=option,
            eligibility=eligibility,
            complete=False,
            missing=[rep_question(f"participation:{car.id}", "participation", car=car_label(car))],
            cost_to_company=car.monthly_cost,
            group_budget=budget,
            participation_status=status,
            value_of_use=car.value_of_use,
            explanation=[eligibility.reason],
            sources=car_sources,
        )

    electric = _is_electric(car, bundle)
    scenario = Scenario(
        value_of_use=car.value_of_use,
        participation=participation,
        track_employee_share=_track_share(car, group, profile, bundle),
    )
    option_side = _price(profile, scenario, electric, bundle)
    participation_label = (
        "השתתפות שאישר נציג התחבורה"
        if status == ParticipationStatus.CONFIRMED and car.id in profile.confirmed_participation
        else "השתתפות ברירת מחדל - ממתינה לאישור נציג"
        if status == ParticipationStatus.DEFAULT_PENDING
        else "השתתפות לפי הקטלוג"
    )
    car_sources.append(
        Source(
            field="participation",
            kind=SourceKind.CONFIG,
            label=participation_label,
            ref=f"catalog[{car.id}].defaultParticipation",
        )
    )
    if electric:
        car_sources.append(
            Source(
                field="electric_refund_net",
                kind=SourceKind.CONFIG,
                label="החזר חשמל נטו",
                ref="rules.electric.netBonus",
            )
        )
    car_track = track_of(car, bundle)
    if car_track is not None:
        car_sources.append(
            Source(
                field="track_employee_share",
                kind=SourceKind.CONFIG,
                label=f"{car_track.label}: חלק העובד בפער",
                ref=f"rules.specialTracks[{car_track.id}].gapSplitEmployee",
            )
        )
    return _computed(
        option,
        eligibility,
        today,
        option_side,
        profile,
        bundle,
        cost_to_company=car.monthly_cost,
        group_budget=budget,
        participation=participation,
        participation_status=status,
        value_of_use=car.value_of_use,
        electric_refund_net=rules.electric.net_bonus
        if electric and rules.electric.method == "gross_up"
        else None,
        sources=car_sources,
    )


def _eligibility_source(
    eligibility: Eligibility, option: Option, profile: Profile, group: str | None
) -> Source:
    """Point the "why?" popover at the rule that actually decided."""
    code = eligibility.reason_code
    if code in ("CAR_REQUIRED", "WAIVER_NOT_ALLOWED", "UNKNOWN_OCCUPATION", "OCCUPATION_GROUP_MISMATCH"):
        return Source(
            field="eligibility",
            kind=SourceKind.CONFIG,
            label="טבלת העיסוקים",
            ref=f"occupations[{profile.occupation}]",
        )
    if code in ("TRACK_MIN_CHILDREN", "MISSING_INFO") and option.track_id:
        return Source(
            field="eligibility",
            kind=SourceKind.CONFIG,
            label="תנאי המסלול",
            ref=f"rules.specialTracks[{option.track_id}].requires",
        )
    if code == "OVER_BUDGET":
        return Source(
            field="eligibility",
            kind=SourceKind.CONFIG,
            label="תקציב הקבוצה",
            ref=f"rules.groups[{group}].budget",
        )
    return Source(
        field="eligibility", kind=SourceKind.CONFIG, label="כללי בחירת קבוצה", ref="rules.chooseFrom"
    )


def _computed(
    option: Option,
    eligibility: Eligibility,
    today: _Priced,
    option_side: _Priced,
    profile: Profile,
    bundle: ConfigBundle,
    *,
    sources: list[Source],
    cost_to_company: Decimal,
    group_budget: Decimal,
    participation: Decimal | None = None,
    participation_status: ParticipationStatus | None = None,
    value_of_use: Decimal | None = None,
    electric_refund_net: Decimal | None = None,
    maintenance: Decimal | None = None,
) -> OptionResult:
    salary, deductions = _pay(profile)
    net_today = shekel_net(today.breakdown.net)
    net_option = shekel_net(option_side.breakdown.net)
    delta = net_option - net_today
    waterfall = build_waterfall(salary, deductions, bundle.rules, today.scenario, option_side.scenario)
    return OptionResult(
        option=option,
        eligibility=eligibility,
        complete=True,
        cost_to_company=cost_to_company,
        group_budget=group_budget,
        participation=participation,
        participation_status=participation_status,
        value_of_use=value_of_use,
        electric_refund_net=electric_refund_net,
        maintenance=maintenance,
        breakdown=option_side.breakdown,
        net_today=net_today,
        net_option=net_option,
        delta=delta,
        waterfall=waterfall,
        explanation=_explanation(today.scenario, option_side.scenario, delta, bundle),
        sources=sources,
    )


def _explanation(today: Scenario, option: Scenario, delta: Decimal, bundle: ConfigBundle) -> list[str]:
    parts: list[str] = []
    electric = bundle.rules.electric
    if option.electric_gross_up > 0 and today.electric_gross_up == 0:
        kind = "נטו" if electric.method == "gross_up" else "ברוטו (חייב במס)"
        parts.append(f"מקבלים החזר חשמל של {shekels(electric.net_bonus)} ₪ {kind}")
    elif today.electric_gross_up > 0 and option.electric_gross_up == 0:
        parts.append("מוותרים על החזר החשמל")
    if option.maintenance > today.maintenance:
        parts.append(f"מקבלים אחזקת רכב של {shekels(option.maintenance)} ₪ (חייבת במס)")
    elif option.maintenance < today.maintenance:
        parts.append(f"מוותרים על אחזקת רכב של {shekels(today.maintenance)} ₪")
    change = participation_change(today.participation, option.participation)
    if change:
        parts.append(change)
    if option.track_employee_share != today.track_employee_share:
        if option.track_employee_share > 0:
            parts.append(f"חלק העובד בפער של המסלול: {shekels(option.track_employee_share)} ₪ בחודש")
        else:
            parts.append(f"בלי חלק העובד במסלול ({shekels(today.track_employee_share)} ₪ היום)")
    return [value_of_use_line(today.value_of_use, option.value_of_use), other_factors_line(parts, delta)]
