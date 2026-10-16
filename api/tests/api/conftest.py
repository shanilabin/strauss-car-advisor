"""API tests run without network or keys: real Tax Authority data from the CSV, an in-memory conversation
store, fixed tokens for three users (two employees and a rep), and a scripted model in place of the LLM."""

from collections.abc import Callable, Iterator

import pytest
from pydantic_ai.models import Model

from index import app
from strauss.adapters.memory_repos import MemoryConversationRepo, StaticAuthVerifier
from strauss.http.deps import (
    get_agent_model,
    get_auth_verifier,
    get_conversation_repo,
    get_value_of_use_repo,
)
from strauss.ports.repositories import AuthUser
from tests.conftest import _tax_authority_repo
from tests.scripted import say, scripted

NOA = AuthUser(id="00000000-0000-0000-0000-00000000000a", role="employee", is_anonymous=True)
OTHER = AuthUser(id="00000000-0000-0000-0000-00000000000b", role="employee", is_anonymous=True)
REP = AuthUser(id="00000000-0000-0000-0000-0000000000ee", role="rep", is_anonymous=False)
TOKENS = {"token-noa": NOA, "token-other": OTHER, "token-rep": REP}


def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


AS_NOA, AS_OTHER, AS_REP = auth("token-noa"), auth("token-other"), auth("token-rep")


@pytest.fixture
def conversations() -> MemoryConversationRepo:
    return MemoryConversationRepo()


class ModelSlot:
    """What the agent runs on in a test. Default: a model that just greets."""

    def __init__(self) -> None:
        self.calls = 0
        self.factory: Callable[[], Model] = lambda: scripted(say("שלום! במה אפשר לעזור?"))

    def __call__(self) -> Model:
        self.calls += 1
        return self.factory()


@pytest.fixture
def model() -> ModelSlot:
    return ModelSlot()


@pytest.fixture(autouse=True)
def offline_dependencies(conversations: MemoryConversationRepo, model: ModelSlot) -> Iterator[None]:
    app.dependency_overrides[get_value_of_use_repo] = _tax_authority_repo
    app.dependency_overrides[get_agent_model] = lambda: model
    app.dependency_overrides[get_conversation_repo] = lambda: conversations
    app.dependency_overrides[get_auth_verifier] = lambda: StaticAuthVerifier(TOKENS)
    yield
    app.dependency_overrides.clear()
