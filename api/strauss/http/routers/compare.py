from fastapi import APIRouter

from strauss.domain.models import Comparison
from strauss.http import stubs
from strauss.http.errors import ERROR_RESPONSES
from strauss.http.schemas import StatelessCompareRequest

router = APIRouter(prefix="/v1", tags=["compare"], responses=ERROR_RESPONSES)


@router.post("/compare")
def compare_stateless(body: StatelessCompareRequest) -> Comparison:
    """Stateless comparison for a full profile - used by form mode and tests. Nothing is stored."""
    return stubs.compare(body.option_ids)
