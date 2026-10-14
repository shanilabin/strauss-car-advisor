"""Minimal client for Supabase's REST API (PostgREST), server-side only.

Used with the secret key, which bypasses RLS - so it must never reach the browser. Shared by the
ingest CLI and the Supabase repositories.
"""

import re
from typing import Any

import httpx

API_URL = re.compile(r"^https://[a-z0-9]{20}\.supabase\.co/?$")


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
    if not API_URL.match(url):
        raise SupabaseError(
            f"SUPABASE_URL לא תקין: {url!r}. צריך להיות כתובת ה-API של הפרויקט, "
            "למשל https://<project-ref>.supabase.co (לא קישור ל-dashboard). "
            "נמצאת ב-Supabase תחת Project Settings ← Data API ← Project URL"
        )
    return httpx.Client(
        base_url=f"{url.rstrip('/')}/rest/v1",
        headers=auth_headers(secret_key),
        timeout=timeout,
        **kwargs,
    )


def raise_for_status(response: httpx.Response) -> None:
    """Anything but a 2xx is a failure - including redirects, which would otherwise look like success."""
    if not response.is_success:
        raise SupabaseError(f"Supabase {response.status_code}: {response.text[:500]}")
