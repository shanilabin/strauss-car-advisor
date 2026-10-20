"""Domain model: the shapes the engine works with and returns.

These models are also the API contract for calculation results (ARCHITECTURE.md, section 3),
so the UI renders numbers straight from them. They hold data only - no logic.
"""

from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from strauss.domain.money import Money, Quantity


class DomainModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# ── Vehicles ─────────────────────────────────────────────────────────────────


class Drive(StrEnum):
    PETROL = "PETROL"
    HYBRID = "HYBRID"
    PLUG_IN = "PLUG_IN"
    ELECTRIC = "ELECTRIC"


class VehicleKey(DomainModel):
    """The Tax Authority's official 5-field key. A commercial name alone is never enough."""

    tax_year: int = Field(ge=2000, le=2100)
    reg_year: int = Field(ge=1990, le=2100)
    vehicle_type_code: int = Field(ge=0, le=9)
    maker_code: str = Field(pattern=r"^\d{5}$")
    model_code: str = Field(pattern=r"^\d{5}$")


class Vehicle(DomainModel):
    key: VehicleKey
    maker_name: str
    commercial_name: str
    model_desc: str
    drive: Drive
    list_price: Money
    value_of_use: Money


# ── Employee profile ─────────────────────────────────────────────────────────


class SalaryInput(DomainModel):
    base: Money = Field(ge=0)
    commissions: Money = Field(default=Decimal(0), ge=0)
    bonus: Money = Field(default=Decimal(0), ge=0)


class Deductions(DomainModel):
    pension_pct: Quantity = Field(ge=0, le=100, description="Employee pension contribution, in percent")
    study_fund_pct: Quantity = Field(default=Decimal(0), ge=0, le=100, description="In percent")
    credit_points: Quantity = Field(ge=0, le=30)


class ParticipationStatus(StrEnum):
    CONFIRMED = "CONFIRMED"
    DEFAULT_PENDING = "DEFAULT_PENDING"  # catalog default, waiting for the rep to confirm
    UNKNOWN = "UNKNOWN"


class CarArrangement(DomainModel):
    kind: Literal["car"] = "car"
    vehicle: Vehicle
    catalog_id: str | None = None
    participation: Money | None = Field(default=None, ge=0)
    participation_status: ParticipationStatus = ParticipationStatus.UNKNOWN


class WaiverArrangement(DomainModel):
    kind: Literal["waiver"] = "waiver"
    maintenance: Money = Field(ge=0)


Arrangement = Annotated[CarArrangement | WaiverArrangement, Field(discriminator="kind")]


class Profile(DomainModel):
    """Everything known about the employee. None means "not provided yet" - never a guess."""

    revision: int = Field(default=0, ge=0, description="Incremented on every change")
    first_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=30,
        description="What the employee asked to be called - optional, never required for a calculation",
    )
    occupation: str | None = None
    group: str | None = None
    salary: SalaryInput | None = None
    deductions: Deductions | None = None
    children_under_23: int | None = Field(default=None, ge=0, le=30)
    current: Arrangement | None = None
    confirmed_participation: dict[str, Money] = Field(
        default_factory=dict,
        description="Participation the transport rep confirmed, per catalog car id (overrides the default)",
    )


# ── Options and results ──────────────────────────────────────────────────────


class OptionKind(StrEnum):
    CATALOG_CAR = "CATALOG_CAR"
    WAIVER = "WAIVER"
    SPECIAL_TRACK = "SPECIAL_TRACK"


class Option(DomainModel):
    id: str
    kind: OptionKind
    label: str
    catalog_id: str | None = None
    track_id: str | None = None
    drive: Drive | None = None


class Eligibility(DomainModel):
    eligible: bool
    reason_code: str
    reason: str = Field(description="Plain-Hebrew reason, built from a template")
    params: dict[str, str | int | float] = Field(default_factory=dict)


class NetBreakdown(DomainModel):
    gross_cash: Money
    value_of_use: Money
    taxable_income: Money
    income_tax: Money
    national_insurance: Money
    health: Money
    pension: Money
    study_fund: Money
    participation: Money
    track_employee_share: Money
    electric_gross_up: Money
    maintenance: Money
    net: Money


WaterfallKey = Literal["value_of_use", "maintenance", "electric_refund", "participation", "track_share"]


class WaterfallStep(DomainModel):
    """One step of a sequential attribution: change one factor, recompute net."""

    key: WaterfallKey
    label: str
    delta: Money
    net_after: Money


class MissingField(DomainModel):
    field: str
    ask: Literal["employee", "rep"]
    question: str


class SourceKind(StrEnum):
    VALUE_OF_USE_DB = "VALUE_OF_USE_DB"
    CONFIG = "CONFIG"


class Source(DomainModel):
    """Where a number comes from - shown in the UI's "why?" popover."""

    field: str
    kind: SourceKind
    label: str
    ref: str


class OptionResult(DomainModel):
    """One alternative versus today. Numbers are None when the option is not eligible or incomplete."""

    option: Option
    eligibility: Eligibility
    complete: bool
    missing: list[MissingField] = Field(default_factory=list)
    cost_to_company: Money | None = None
    group_budget: Money | None = None
    participation: Money | None = None
    participation_status: ParticipationStatus | None = None
    value_of_use: Money | None = None
    electric_refund_net: Money | None = None
    maintenance: Money | None = None
    breakdown: NetBreakdown | None = None
    net_today: Money | None = None
    net_option: Money | None = None
    delta: Money | None = None
    waterfall: list[WaterfallStep] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list, max_length=2)
    sources: list[Source] = Field(default_factory=list)
    break_even_participation: Money | None = Field(
        default=None,
        description="The monthly participation in this car at which it leaves exactly the net of today: "
        "below it the car pays off, above it today does. Verified by recomputing the option at that "
        "participation; null when there is no such amount (no car, nothing computed, or below zero).",
    )


class CalculationContext(DomainModel):
    """Everything needed to reproduce a comparison."""

    payroll_tax_year: int
    value_of_use_tax_year: int
    config_version: str
    config_hash: str
    engine_version: str


class Comparison(DomainModel):
    id: str
    context: CalculationContext
    profile_snapshot: Profile
    today: NetBreakdown
    results: list[OptionResult]
    best_option_id: str | None = None
