from typing import Annotated

from fastapi import APIRouter, Query

from strauss.domain.models import Vehicle, VehicleKey
from strauss.http import stubs
from strauss.http.errors import ERROR_RESPONSES

router = APIRouter(prefix="/v1/vehicles", tags=["vehicles"], responses=ERROR_RESPONSES)


@router.get("/search")
def search_vehicles(
    q: Annotated[str, Query(min_length=2, max_length=60, description="Commercial or maker name")],
    reg_year: Annotated[int | None, Query(ge=1990, le=2100)] = None,
) -> list[Vehicle]:
    """Up to 5 candidates, each with its full official key."""
    return stubs.search_vehicles(q, reg_year)


@router.get("/value-of-use")
def get_value_of_use(
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
    return stubs.value_of_use(key)
