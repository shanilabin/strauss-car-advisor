"""Models for the config bundle entities that the API exposes (catalog, occupations).

Config files use camelCase (the challenge's format); the API speaks snake_case.
The full rules schema and cross-checks arrive in task A2.2.
"""

from typing import Annotated, Literal

from pydantic import AliasGenerator, BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from strauss.domain.models import Deductions, Drive, SalaryInput
from strauss.domain.money import Money, Quantity


class ConfigModel(BaseModel):
    model_config = ConfigDict(
        frozen=True,
        extra="forbid",
        alias_generator=AliasGenerator(validation_alias=to_camel),
    )


class CatalogCar(ConfigModel):
    id: str
    group: str
    maker_name: str
    maker_code: str = Field(pattern=r"^\d{5}$")
    commercial_name: str
    model_code: str = Field(pattern=r"^\d{5}$")
    model_desc: str
    reg_year: int
    vehicle_type_code: int
    drive: Drive
    list_price: Money
    value_of_use: Money = Field(description="Copied from the Tax Authority file; cross-checked in CI")
    monthly_cost: Money
    default_participation: Money


class Occupation(ConfigModel):
    name: str
    group: str
    car_required: bool
    waiver_allowed: bool
    maintenance: Money


class GroupBudget(ConfigModel):
    code: str = Field(min_length=1)
    budget: Money = Field(gt=0)


class SampleDeductions(ConfigModel):
    pension_pct: Quantity
    study_fund_pct: Quantity
    credit_points: Quantity

    def to_domain(self) -> Deductions:
        return Deductions(
            pension_pct=self.pension_pct, study_fund_pct=self.study_fund_pct, credit_points=self.credit_points
        )


class SampleCurrentCar(ConfigModel):
    kind: Literal["car"]
    catalog_id: str
    participation: Money


class SampleCurrentWaiver(ConfigModel):
    kind: Literal["waiver"]
    maintenance: Money


class SampleEmployee(ConfigModel):
    """One of the challenge's six fictitious employees (demo and tests only)."""

    id: str
    name: str
    occupation: str
    group: str
    salary: SalaryInput
    deductions: SampleDeductions
    children_under_23: int
    current: Annotated[SampleCurrentCar | SampleCurrentWaiver, Field(discriminator="kind")]
    question: str
