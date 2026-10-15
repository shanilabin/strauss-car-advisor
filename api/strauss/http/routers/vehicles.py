from typing import Annotated

from fastapi import APIRouter, Query

from strauss.config.loader import load_rules
from strauss.domain.models import Vehicle, VehicleKey
from strauss.http.deps import ValueOfUseDep
from strauss.http.errors import ERROR_RESPONSES, ApiError

router = APIRouter(prefix="/v1/vehicles", tags=["vehicles"], responses=ERROR_RESPONSES)

SEARCH_LIMIT = 5


@router.get("/search")
def search_vehicles(
    repo: ValueOfUseDep,
    q: Annotated[str, Query(min_length=2, max_length=60, description="Commercial or maker name")],
    reg_year: Annotated[int | None, Query(ge=1990, le=2100)] = None,
) -> list[Vehicle]:
    """Up to 5 candidates for the configured tax year, each with its full official key."""
    return repo.search(q, load_rules().value_of_use.tax_year, reg_year, SEARCH_LIMIT)


@router.get("/value-of-use")
def get_value_of_use(
    repo: ValueOfUseDep,
    tax_year: Annotated[int, Query(ge=2000, le=2100)],
    reg_year: Annotated[int, Query(ge=1990, le=2100)],
    vehicle_type_code: Annotated[int, Query(ge=0, le=9)],
    maker_code: Annotated[str, Query(pattern=r"^\d{5}$")],
    model_code: Annotated[str, Query(pattern=r"^\d{5}$")],
) -> Vehicle:
    """Look up by the full 5-field key (all required). Unknown key -> 404, never a guess."""
    key = VehicleKey(
        tax_year=tax_year,
        reg_year=reg_year,
        vehicle_type_code=vehicle_type_code,
        maker_code=maker_code,
        model_code=model_code,
    )
    vehicle = repo.get(key)
    if vehicle is None:
        raise ApiError(404, "vehicle_not_found", "הרכב לא נמצא במאגר שווי השימוש לפי המפתח שנמסר")
    return vehicle
