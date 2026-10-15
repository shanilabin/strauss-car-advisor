"""Is an option allowed for this employee, and why (ARCHITECTURE.md, section 3).

Checks run in a fixed order; the first one that fails decides the reason:
  1. what we know: occupation (and children, for a special track) - missing -> ask, never assume
  2. the occupation exists, and the stated group (if any) matches the occupation's group
  3. waiver: allowed by the occupation, and not a mandatory-car role
  4. special track (e.g. family): enough children; group and budget do not apply
  5. regular car: from the employee's group or lower (rules.chooseFrom), and within budget

Everything comes from the config bundle; the result carries a code, params and a Hebrew reason.
"""

from decimal import Decimal

from strauss.config.bundle import ConfigBundle
from strauss.config.models import CatalogCar, Occupation
from strauss.config.schema import SpecialTrack
from strauss.domain.explain import FIELD_LABELS, reason, shekels
from strauss.domain.models import Eligibility, Option, OptionKind, Profile

HUNDRED = Decimal(100)


def _result(eligible: bool, code: str, **params: str | int | float) -> Eligibility:
    return Eligibility(eligible=eligible, reason_code=code, reason=reason(code, **params), params=params)


def _missing(*fields: str) -> Eligibility:
    labels = ", ".join(FIELD_LABELS.get(f, f) for f in fields)
    return Eligibility(
        eligible=False,
        reason_code="MISSING_INFO",
        reason=reason("MISSING_INFO", missing=labels),
        params={"fields": ",".join(fields)},
    )


def employee_group(profile: Profile, bundle: ConfigBundle) -> tuple[Occupation | None, Eligibility | None]:
    """The occupation and the group it implies - or the reason they can't be used yet."""
    if not profile.occupation:
        return None, _missing("occupation")
    occupation = next((o for o in bundle.occupations if o.name == profile.occupation), None)
    if occupation is None:
        return None, _result(False, "UNKNOWN_OCCUPATION", occupation=profile.occupation)
    if profile.group and profile.group != occupation.group:
        return occupation, _result(
            False,
            "OCCUPATION_GROUP_MISMATCH",
            occupation=occupation.name,
            occupation_group=occupation.group,
            stated_group=profile.group,
        )
    return occupation, None


def track_of(car: CatalogCar, bundle: ConfigBundle) -> SpecialTrack | None:
    for track in bundle.rules.special_tracks:
        if car.group == track.catalog_group or car.id in track.cars:
            return track
    return None


def check_eligibility(profile: Profile, option: Option, bundle: ConfigBundle) -> Eligibility:
    occupation, problem = employee_group(profile, bundle)
    if problem is not None:
        return problem
    if occupation is None:  # employee_group returns one or the other; keep the invariant explicit
        raise RuntimeError("employee_group returned neither an occupation nor a reason")

    if option.kind == OptionKind.WAIVER:
        return _waiver(occupation)

    if option.catalog_id is None:
        raise ValueError(f"option {option.id} has no catalog car")
    car = bundle.catalog_car(option.catalog_id)
    track = track_of(car, bundle)
    if track is not None:
        return _special_track(profile, track)
    return _regular_car(car, occupation, bundle)


def _waiver(occupation: Occupation) -> Eligibility:
    if occupation.car_required:
        return _result(False, "CAR_REQUIRED", occupation=occupation.name)
    if not occupation.waiver_allowed:
        return _result(False, "WAIVER_NOT_ALLOWED", occupation=occupation.name)
    return _result(True, "WAIVER_OK", occupation=occupation.name)


def _special_track(profile: Profile, track: SpecialTrack) -> Eligibility:
    if profile.children_under_23 is None:
        return _missing("children_under_23")
    if profile.children_under_23 < track.requires.min_children:
        return _result(
            False,
            "TRACK_MIN_CHILDREN",
            track_label=track.label,
            min_children=track.requires.min_children,
            max_age=track.requires.child_max_age,
        )
    return _result(
        True,
        "TRACK_OK",
        track_label=track.label,
        children=profile.children_under_23,
        employee_share=int(track.gap_split_employee * HUNDRED),
    )


def _regular_car(car: CatalogCar, occupation: Occupation, bundle: ConfigBundle) -> Eligibility:
    rules = bundle.rules
    groups = {"car_group": car.group, "employee_group": occupation.group}
    car_rank, own_rank = rules.group_rank(car.group), rules.group_rank(occupation.group)
    if rules.choose_from == "own_or_lower" and car_rank > own_rank:
        return _result(False, "HIGHER_GROUP", **groups)
    if rules.choose_from == "own_only" and car_rank != own_rank:
        return _result(False, "OTHER_GROUP", **groups)
    budget = rules.budget(occupation.group)
    if rules.enforce_budget and car.monthly_cost > budget:
        return _result(False, "OVER_BUDGET", cost=shekels(car.monthly_cost), budget=shekels(budget))
    code = {"own_or_lower": "OK_OWN_OR_LOWER", "own_only": "OK_OWN_GROUP", "any": "OK_ANY_GROUP"}[
        rules.choose_from
    ]
    return _result(True, code, **groups)
