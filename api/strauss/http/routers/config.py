from fastapi import APIRouter

from strauss.config.loader import config_hash, load_catalog, load_occupations, load_rules_raw
from strauss.config.models import CatalogCar, GroupBudget, Occupation
from strauss.http.schemas import ConfigSummary

router = APIRouter(prefix="/v1", tags=["config"])


@router.get("/catalog")
def get_catalog() -> list[CatalogCar]:
    return list(load_catalog())


@router.get("/occupations")
def get_occupations() -> list[Occupation]:
    return list(load_occupations())


@router.get("/config")
def get_config() -> ConfigSummary:
    """The active rules, their fingerprint and tax years - backs the "why?" popover."""
    rules = load_rules_raw()
    return ConfigSummary(
        version=rules["version"],
        config_hash=config_hash(),
        payroll_tax_year=rules["netMethod"]["taxYear"],
        value_of_use_tax_year=rules["valueOfUse"]["taxYear"],
        groups=[GroupBudget.model_validate(g) for g in rules["groups"]],
        rules=rules,
    )
