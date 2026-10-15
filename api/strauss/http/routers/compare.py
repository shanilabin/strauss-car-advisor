from fastapi import APIRouter

from strauss.config.loader import load_bundle
from strauss.domain.compare import compare
from strauss.domain.models import CarArrangement, Comparison
from strauss.http.deps import ValueOfUseDep
from strauss.http.errors import ERROR_RESPONSES, ApiError
from strauss.http.schemas import StatelessCompareRequest

router = APIRouter(prefix="/v1", tags=["compare"], responses=ERROR_RESPONSES)


@router.post("/compare")
def compare_stateless(body: StatelessCompareRequest, repo: ValueOfUseDep) -> Comparison:
    """Stateless comparison for a full profile - the real engine; used by form mode and tests. Nothing is
    stored. An incomplete profile returns 422 'incomplete_profile' with the questions to ask.

    The client's profile is not trusted for facts it can't know: today's car is re-read from the Tax
    Authority data by its key, and rep confirmations are ignored (only the rep flow can set them).
    """
    profile = body.profile.model_copy(update={"confirmed_participation": {}})
    if isinstance(profile.current, CarArrangement):
        official = repo.get(profile.current.vehicle.key)
        if official is None:
            raise ApiError(404, "vehicle_not_found", "הרכב הנוכחי לא נמצא במאגר שווי השימוש לפי המפתח שנמסר")
        profile = profile.model_copy(
            update={"current": profile.current.model_copy(update={"vehicle": official})}
        )
    return compare(profile, load_bundle(), body.option_ids)
