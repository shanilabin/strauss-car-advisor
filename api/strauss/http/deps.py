"""Dependencies the routers receive. Tests override these with in-memory or CSV implementations."""

from functools import lru_cache
from typing import Annotated

import httpx
from fastapi import Depends

from strauss.adapters.supabase_rest import rest_client
from strauss.adapters.supabase_value_of_use import SupabaseValueOfUseRepo
from strauss.config.loader import load_rules
from strauss.ports.repositories import ValueOfUseRepo
from strauss.settings import get_settings


@lru_cache
def supabase_client() -> httpx.Client:
    """One pooled client per process, so warm instances reuse connections."""
    settings = get_settings()
    return rest_client(settings.supabase_url, settings.supabase_secret_key, timeout=10.0)


def get_value_of_use_repo() -> ValueOfUseRepo:
    return SupabaseValueOfUseRepo(supabase_client(), load_rules().value_of_use)


ValueOfUseDep = Annotated[ValueOfUseRepo, Depends(get_value_of_use_repo)]
