"""Authentication: every protected endpoint gets the verified Supabase user, or the request is refused (401).

The browser sends its Supabase access token (anonymous sign-in for employees, email/password for reps).
The token is verified by Supabase Auth (see adapters/supabase_auth.py); ownership of a conversation is
checked by the service layer on every call.
"""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from strauss.errors import ApiError
from strauss.http.deps import AuthVerifierDep
from strauss.ports.repositories import AuthUser

bearer = HTTPBearer(auto_error=False, description="Supabase access token (anonymous or rep)")


def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    verifier: AuthVerifierDep,
) -> AuthUser:
    if credentials is None:
        raise ApiError(401, "not_authenticated", "נדרשת התחברות")
    user = verifier.verify(credentials.credentials)
    if user is None:
        raise ApiError(401, "invalid_token", "פג תוקף ההתחברות. רעננו את הדף")
    return user


def current_rep(user: Annotated[AuthUser, Depends(current_user)]) -> AuthUser:
    if user.role != "rep":
        raise ApiError(403, "rep_only", "המסך הזה מיועד לנציגי התחבורה בלבד")
    return user


UserDep = Annotated[AuthUser, Depends(current_user)]
RepDep = Annotated[AuthUser, Depends(current_rep)]
