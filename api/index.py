"""Vercel entrypoint. The real application lives in strauss.http.app."""

from strauss.http.app import app

__all__ = ["app"]
