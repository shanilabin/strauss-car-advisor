"""AuthVerifier backed by Supabase Auth: asks Supabase who a token belongs to.

Works for every signing method (legacy HS256 or the newer asymmetric keys) because Supabase itself checks
the token. Valid answers are cached briefly per token, so a conversation's requests don't each pay a
round trip; tokens are only stored hashed.

Trade-off: a token that is signed out or revoked keeps working for up to CACHE_SECONDS on a warm
instance. Fine for the demo; a pilot with SSO would verify JWTs locally against the project's JWKS.
"""

import hashlib
import time
from collections import OrderedDict

import httpx

from strauss.adapters.supabase_rest import SupabaseError, auth_headers
from strauss.ports.repositories import AuthUser, Role

CACHE_SECONDS = 60
CACHE_SIZE = 2_000


class SupabaseAuthVerifier:
    def __init__(self, client: httpx.Client, secret_key: str) -> None:
        self._client = client
        self._apikey = auth_headers(secret_key)["apikey"]
        self._cache: OrderedDict[str, tuple[float, AuthUser]] = OrderedDict()

    def verify(self, token: str) -> AuthUser | None:
        digest = hashlib.sha256(token.encode()).hexdigest()
        cached = self._cache.get(digest)
        now = time.monotonic()
        if cached and cached[0] > now:
            return cached[1]
        response = self._client.get(
            "/auth/v1/user", headers={"apikey": self._apikey, "Authorization": f"Bearer {token}"}
        )
        if response.status_code in (401, 403):
            return None
        if not response.is_success:
            raise SupabaseError(f"Supabase auth {response.status_code}: {response.text[:200]}")
        body = response.json()
        role: Role = "rep" if (body.get("app_metadata") or {}).get("role") == "rep" else "employee"
        user = AuthUser(
            id=body["id"],
            role=role,
            is_anonymous=bool(body.get("is_anonymous")),
            first_name=first_name(body.get("user_metadata") or {}),
        )
        self._cache[digest] = (now + CACHE_SECONDS, user)
        if len(self._cache) > CACHE_SIZE:
            self._cache.popitem(last=False)
        return user


def first_name(metadata: dict[str, object]) -> str | None:
    """The first name a sign-in account carries: Google's given_name, else the first word of the full name.
    Email sign-ups carry none - the advisor then asks, as before."""
    for key in ("given_name", "first_name"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:30]
    for key in ("full_name", "name"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.split()[0][:30]
    return None
