"""Checks that span the config files and the Tax Authority data.

Single-file rules (ordered brackets, unique codes, ...) are enforced by the Pydantic schema; this module
checks that the files agree with each other. Every problem is reported - not just the first - with a
Hebrew message and a path, so whoever edits the config sees everything to fix in one run.
"""

from collections import Counter
from dataclasses import dataclass, field
from typing import Literal

from strauss.config.bundle import ConfigBundle
from strauss.domain.models import VehicleKey
from strauss.ports.repositories import ValueOfUseRepo


@dataclass(frozen=True)
class Issue:
    level: Literal["error", "warning"]
    code: str
    path: str
    message_he: str


@dataclass
class ValidationReport:
    issues: list[Issue] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.errors

    @property
    def errors(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "error"]

    @property
    def warnings(self) -> list[Issue]:
        return [i for i in self.issues if i.level == "warning"]

    def error(self, code: str, path: str, message_he: str) -> None:
        self.issues.append(Issue("error", code, path, message_he))

    def warning(self, code: str, path: str, message_he: str) -> None:
        self.issues.append(Issue("warning", code, path, message_he))


def crosscheck(bundle: ConfigBundle, value_of_use: ValueOfUseRepo | None = None) -> ValidationReport:
    """Validate the bundle as a whole. Without value_of_use, the Tax Authority check is skipped (warning)."""
    report = ValidationReport()
    _check_groups(bundle, report)
    _check_budgets(bundle, report)
    _check_occupations(bundle, report)
    _check_catalog_ids(bundle, report)
    if value_of_use is None:
        report.warning("vou_not_checked", "catalog", "הקטלוג לא נבדק מול מאגר רשות המסים (לא סופק מאגר)")
    else:
        _check_catalog_against_tax_authority(bundle, value_of_use, report)
    report.stats = {
        "groups": len(bundle.rules.groups),
        "catalog_cars": len(bundle.catalog),
        "occupations": len(bundle.occupations),
    }
    return report


def _check_groups(bundle: ConfigBundle, report: ValidationReport) -> None:
    """1. Every group used by the catalog and the occupations exists."""
    eligibility_groups = {g.code for g in bundle.rules.groups}
    catalog_groups = eligibility_groups | {t.catalog_group for t in bundle.rules.special_tracks}
    for car in bundle.catalog:
        if car.group not in catalog_groups:
            report.error("unknown_group", f"catalog[{car.id}].group", f"קבוצה לא מוגדרת בכללים: {car.group}")
    for occ in bundle.occupations:
        if occ.group not in eligibility_groups:
            report.error(
                "unknown_group", f"occupations[{occ.name}].group", f"קבוצת זכאות לא מוגדרת: {occ.group}"
            )
    catalog_by_id = {car.id: car for car in bundle.catalog}
    for track in bundle.rules.special_tracks:
        for car_id in track.cars:
            listed = catalog_by_id.get(car_id)
            path = f"rules.specialTracks[{track.id}].cars"
            if listed is None:
                report.error("unknown_track_car", path, f"הרכב {car_id} לא קיים בקטלוג")
            elif listed.group != track.catalog_group:
                report.error(
                    "track_car_wrong_group",
                    path,
                    f"הרכב {car_id} בקבוצה {listed.group}, לא בקבוצת המסלול {track.catalog_group}",
                )
        if not any(car.group == track.catalog_group for car in bundle.catalog):
            report.warning(
                "empty_track",
                f"rules.specialTracks[{track.id}]",
                f"אין בקטלוג רכבים למסלול '{track.label}'",
            )


def _check_budgets(bundle: ConfigBundle, report: ValidationReport) -> None:
    """A regular catalog car that costs more than its own group's budget can never be chosen."""
    if not bundle.rules.enforce_budget:
        return
    budgets = {g.code: g.budget for g in bundle.rules.groups}
    for car in bundle.catalog:
        budget = budgets.get(car.group)
        if budget is not None and car.monthly_cost > budget:
            report.warning(
                "over_own_budget",
                f"catalog[{car.id}].monthlyCost",
                f"הרכב עולה {car.monthly_cost} ₪, יותר מתקציב קבוצה {car.group} ({budget} ₪), "
                "ולכן אף עובד בקבוצה לא יוכל לבחור בו",
            )


def _check_occupations(bundle: ConfigBundle, report: ValidationReport) -> None:
    """4. A required car cannot be waived; a waivable car must come with maintenance."""
    for name, count in Counter(o.name for o in bundle.occupations).items():
        if count > 1:
            report.error("duplicate_occupation", f"occupations[{name}]", "עיסוק מופיע יותר מפעם אחת")
    for occ in bundle.occupations:
        path = f"occupations[{occ.name}]"
        if occ.car_required and occ.waiver_allowed:
            report.error("required_but_waivable", path, "רכב חובה לא יכול להיות גם ניתן לוויתור")
        if occ.waiver_allowed and occ.maintenance <= 0:
            report.error("waiver_without_maintenance", path, "מותר לוותר אבל אחזקת הרכב היא 0")
        if not occ.waiver_allowed and occ.maintenance > 0:
            report.warning("maintenance_unused", path, "הוגדרה אחזקת רכב לעיסוק שאסור לו לוותר")


def _check_catalog_ids(bundle: ConfigBundle, report: ValidationReport) -> None:
    for car_id, count in Counter(c.id for c in bundle.catalog).items():
        if count > 1:
            report.error("duplicate_catalog_id", f"catalog[{car_id}]", "מזהה רכב מופיע יותר מפעם אחת")


def _check_catalog_against_tax_authority(
    bundle: ConfigBundle, value_of_use: ValueOfUseRepo, report: ValidationReport
) -> None:
    """2. Each catalog car exists in the Tax Authority data by its full key, with equal value and drive."""
    tax_year = bundle.rules.value_of_use.tax_year
    for car in bundle.catalog:
        path = f"catalog[{car.id}]"
        key = VehicleKey(
            tax_year=tax_year,
            reg_year=car.reg_year,
            vehicle_type_code=car.vehicle_type_code,
            maker_code=car.maker_code,
            model_code=car.model_code,
        )
        official = value_of_use.get(key)
        if official is None:
            report.error("not_in_tax_authority", path, f"הרכב לא נמצא במאגר רשות המסים לפי המפתח {key}")
            continue
        if official.value_of_use != car.value_of_use:
            report.error(
                "value_of_use_mismatch",
                f"{path}.valueOfUse",
                f"שווי השימוש בקטלוג ({car.value_of_use}) שונה מהמאגר ({official.value_of_use})",
            )
        if official.drive != car.drive:
            report.error(
                "drive_mismatch",
                f"{path}.drive",
                f"ההנעה בקטלוג ({car.drive}) שונה מהמאגר ({official.drive})",
            )
