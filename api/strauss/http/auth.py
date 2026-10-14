"""Authentication dependency.

Contract stage (A2.1): the bearer scheme is declared so the OpenAPI contract and the generated client
already send the Supabase JWT, but the token is not verified yet. Task A3.4 verifies it (signature,
expiry), resolves the user and role, and enforces conversation ownership on every endpoint.
"""

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False, description="Supabase access token (anonymous or rep)")


@dataclass(frozen=True)
class Caller:
    token: str | None


def current_caller(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> Caller:
    return Caller(token=credentials.credentials if credentials else None)


CallerDep = Annotated[Caller, Depends(current_caller)]
