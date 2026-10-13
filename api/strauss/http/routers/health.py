from fastapi import APIRouter
from pydantic import BaseModel

from strauss import ENGINE_VERSION, __version__
from strauss.settings import get_settings

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str
    engine_version: str
    environment: str
    configured: dict[str, bool]


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(
        status="ok",
        version=__version__,
        engine_version=ENGINE_VERSION,
        environment=settings.environment,
        configured=settings.configured,
    )
