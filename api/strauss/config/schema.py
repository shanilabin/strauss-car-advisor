"""Typed schema for api/config/rules.json (ARCHITECTURE.md, section 4).

Every business number the engine uses is a field here. Checks that only need this one file live in the
validators below; checks that span files (catalog, occupations, the Tax Authority data) live in
crosscheck.py.
"""

from datetime import date
from decimal import Decimal
from itertools import pairwise
from typing import Annotated, Literal, Self

from pydantic import BeforeValidator, Field, model_validator

from strauss.config.models import ConfigModel, GroupBudget
from strauss.domain.models import Drive
from strauss.domain.money import Money, Quantity

Rate = Annotated[Quantity, Field(ge=0, le=1)]
SalaryComponent = Literal["base", "commissions", "bonus"]


class Electric(ConfigModel):
    net_bonus: Money = Field(ge=0, description="What the employee sees in net pay")
    method: Literal["gross_up", "gross"]
    drives: list[Drive] = Field(min_length=1)


class TrackRequirements(ConfigModel):
    min_children: int = Field(ge=1)
    child_max_age: int = Field(ge=0, le=40)


class SpecialTrack(ConfigModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    catalog_group: str = Field(min_length=1, description="Catalog group whose cars belong to this track")
    cars: list[str] = Field(default_factory=list, description="Catalog ids in the track (cross-checked)")
    requires: TrackRequirements
    gap_split_employee: Rate = Field(description="Employee's share of the cost above the group budget")


class Waiver(ConfigModel):
    allowed_by: Literal["occupation"]
    maintenance_is_taxable: bool
    maintenance_is_pensionable: bool


class Participation(ConfigModel):
    policy: Literal["default_pending_rep", "always_ask_rep", "default_confirmed"]
    reduces_value_of_use: Literal[False] = Field(
        description="Participation is a net-only deduction (the only treatment the engine implements)"
    )


class Projection(ConfigModel):
    years: list[int] = Field(min_length=1, description="Horizons the card adds the monthly delta up to")

    @model_validator(mode="after")
    def _sensible(self) -> Self:
        if any(not 1 <= y <= 10 for y in self.years) or len(set(self.years)) != len(self.years):
            raise ValueError("שנות התחזית חייבות להיות שונות זו מזו ובין 1 ל-10")
        return self


class Payroll(ConfigModel):
    pensionable_components: list[SalaryComponent] = Field(min_length=1)
    study_fund_components: list[SalaryComponent] = Field(min_length=1)
    study_fund_ceiling: Money | None = Field(default=None, gt=0)

    @model_validator(mode="after")
    def _components_are_unique(self) -> Self:
        for name, components in (
            ("pensionableComponents", self.pensionable_components),
            ("studyFundComponents", self.study_fund_components),
        ):
            if len(set(components)) != len(components):
                raise ValueError(f"רכיב שכר מופיע פעמיים ב-{name}")
        return self


def _pair_to_bracket(value: object) -> object:
    """The file writes a bracket as [upTo, rate]; accept that form as well as {upTo, rate}."""
    if isinstance(value, list | tuple) and len(value) == 2:
        return {"upTo": value[0], "rate": value[1]}
    return value


class Bracket(ConfigModel):
    up_to: Money | None = Field(gt=0, description="Upper bound of the slice; null = no upper bound")
    rate: Rate


class TwoTier(ConfigModel):
    """National insurance / health: a low rate up to the threshold, a high rate up to the ceiling."""

    threshold: Money = Field(gt=0)
    ceiling: Money = Field(gt=0)
    low_rate: Rate
    high_rate: Rate

    @model_validator(mode="after")
    def _ceiling_above_threshold(self) -> Self:
        if self.ceiling <= self.threshold:
            raise ValueError("התקרה חייבת להיות גבוהה מהסף")
        return self


class PensionCredit(ConfigModel):
    rate: Rate
    income_ceiling: Money = Field(gt=0)
    max_contribution_rate: Rate


class Rounding(ConfigModel):
    """No rounding during the calculation (including the gross-up); whole shekels only for display."""

    during: Literal["none"]
    display: Literal["shekel"]


class NetMethod(ConfigModel):
    basis: Literal["monthly"]
    tax_year: int = Field(ge=2000, le=2100)
    credit_point_value: Money = Field(gt=0)
    brackets: list[Annotated[Bracket, BeforeValidator(_pair_to_bracket)]] = Field(min_length=1)
    national_insurance: TwoTier
    health: TwoTier
    pension_credit: PensionCredit
    rounding: Rounding

    @model_validator(mode="after")
    def _brackets_are_ordered(self) -> Self:
        bounds = [b.up_to for b in self.brackets]
        if bounds[-1] is not None:
            raise ValueError("המדרגה האחרונה חייבת להיות פתוחה (upTo = null)")
        if None in bounds[:-1]:
            raise ValueError("רק המדרגה האחרונה יכולה להיות פתוחה (upTo = null)")
        closed = [b for b in bounds[:-1] if b is not None]
        if any(lower >= upper for lower, upper in pairwise(closed)):
            raise ValueError("גבולות המדרגות חייבים לעלות")
        return self


class CsvColumns(ConfigModel):
    """Header names in the Tax Authority file - if next year's file renames a column, change it here."""

    tax_year: str
    reg_year: str
    vehicle_type_code: str
    maker_code: str
    maker_name: str
    model_code: str
    model_desc: str
    fuel_type: str
    commercial_name: str
    automatic: str
    drive_code: str
    green_score: str
    pollution_level: str
    engine_cc: str
    weight: str
    effective_date: str
    list_price: str
    adjusted_price: str
    value_of_use: str


class CsvFormat(ConfigModel):
    encoding: str
    columns: CsvColumns


class ValueOfUse(ConfigModel):
    tax_year: int = Field(ge=2000, le=2100)
    source: str
    drive_field: dict[str, Drive] = Field(min_length=1, description="Code in the file -> drive")
    csv: CsvFormat


class Rules(ConfigModel):
    version: str = Field(min_length=1)
    effective_from: date
    currency: Literal["ILS"]
    note: str | None = None
    groups: list[GroupBudget] = Field(min_length=1, description="Ordered from lowest to highest")
    choose_from: Literal["own_or_lower", "own_only", "any"]
    enforce_budget: bool
    unused_budget: Literal["not_paid"]
    electric: Electric
    special_tracks: list[SpecialTrack] = Field(default_factory=list)
    waiver: Waiver
    participation: Participation
    projection: Projection
    payroll: Payroll
    net_method: NetMethod
    value_of_use: ValueOfUse

    @model_validator(mode="after")
    def _codes_are_unique(self) -> Self:
        codes = [g.code for g in self.groups]
        if len(set(codes)) != len(codes):
            raise ValueError("קודי הקבוצות חייבים להיות ייחודיים")
        track_ids = [t.id for t in self.special_tracks]
        if len(set(track_ids)) != len(track_ids):
            raise ValueError("מזהי המסלולים המיוחדים חייבים להיות ייחודיים")
        clashes = {t.catalog_group for t in self.special_tracks} & set(codes)
        if clashes:
            raise ValueError(f"קבוצת קטלוג של מסלול מיוחד מתנגשת בקבוצת זכאות: {sorted(clashes)}")
        return self

    def group_rank(self, code: str) -> int:
        """0 = lowest group. Raises KeyError for an unknown code."""
        for rank, group in enumerate(self.groups):
            if group.code == code:
                return rank
        raise KeyError(code)

    def budget(self, code: str) -> Decimal:
        """Monthly car budget of an eligibility group. Raises KeyError for an unknown code."""
        return self.groups[self.group_rank(code)].budget
