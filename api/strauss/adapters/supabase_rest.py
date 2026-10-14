"""Minimal client for Supabase's REST API (PostgREST), server-side only.

Used with the secret key, which bypasses RLS - so it must never reach the browser. Shared by the
ingest CLI and the Supabase repositories.
"""

from typing import Any

import httpx


class SupabaseError(RuntimeError):
    """A Supabase request failed; the message carries the status and PostgREST's explanation."""


def auth_headers(secret_key: str) -> dict[str, str]:
    """New-style keys (sb_secret_...) go in the apikey header only; legacy JWT keys also as a bearer."""
    headers = {"apikey": secret_key}
    if secret_key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {secret_key}"
    return headers


def rest_client(url: str, secret_key: str, *, timeout: float = 60.0, **kwargs: Any) -> httpx.Client:
    if not url or not secret_key:
        raise SupabaseError("חסרים SUPABASE_URL או SUPABASE_SECRET_KEY (ב-api/.env.local או במשתני הסביבה)")
    return httpx.Client(
        base_url=f"{url.rstrip('/')}/rest/v1",
        headers=auth_headers(secret_key),
        timeout=timeout,
        **kwargs,
    )


def raise_for_status(response: httpx.Response) -> None:
    if response.is_error:
        raise SupabaseError(f"Supabase {response.status_code}: {response.text[:500]}")
