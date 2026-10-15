"""API tests run without network or keys: real Tax Authority data from the CSV, an in-memory conversation
store, and fixed tokens for three users (two employees and a rep)."""

from collections.abc import Iterator

import pytest

from index import app
from strauss.adapters.memory_repos import MemoryConversationRepo, StaticAuthVerifier
from strauss.http.deps import get_auth_verifier, get_conversation_repo, get_value_of_use_repo
from strauss.ports.repositories import AuthUser
from tests.conftest import _tax_authority_repo

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


@pytest.fixture(autouse=True)
def offline_dependencies(conversations: MemoryConversationRepo) -> Iterator[None]:
    app.dependency_overrides[get_value_of_use_repo] = _tax_authority_repo
    app.dependency_overrides[get_conversation_repo] = lambda: conversations
    app.dependency_overrides[get_auth_verifier] = lambda: StaticAuthVerifier(TOKENS)
    yield
    app.dependency_overrides.clear()
