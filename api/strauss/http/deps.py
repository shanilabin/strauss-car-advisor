"""Dependencies the routers receive. Tests override these with in-memory or CSV implementations."""

from functools import lru_cache
from typing import Annotated

import httpx
from fastapi import Depends

from strauss.adapters.supabase_auth import SupabaseAuthVerifier
from strauss.adapters.supabase_conversations import SupabaseConversationRepo
from strauss.adapters.supabase_rest import rest_client, validated_url
from strauss.adapters.supabase_value_of_use import SupabaseValueOfUseRepo
from strauss.config.loader import load_bundle, load_rules
from strauss.ports.repositories import AuthVerifier, ConversationRepo, ValueOfUseRepo
from strauss.services.conversations import ConversationService
from strauss.settings import get_settings


@lru_cache
def supabase_client() -> httpx.Client:
    """One pooled PostgREST client per process, so warm instances reuse connections."""
    settings = get_settings()
    return rest_client(settings.supabase_url, settings.supabase_secret_key, timeout=10.0)


@lru_cache
def auth_verifier() -> SupabaseAuthVerifier:
    settings = get_settings()
    url = validated_url(settings.supabase_url, settings.supabase_secret_key)
    client = httpx.Client(base_url=url, timeout=10.0)
    return SupabaseAuthVerifier(client, settings.supabase_secret_key)


def get_value_of_use_repo() -> ValueOfUseRepo:
    return SupabaseValueOfUseRepo(supabase_client(), load_rules().value_of_use)


def get_conversation_repo() -> ConversationRepo:
    return SupabaseConversationRepo(supabase_client())


def get_auth_verifier() -> AuthVerifier:
    return auth_verifier()


ValueOfUseDep = Annotated[ValueOfUseRepo, Depends(get_value_of_use_repo)]
ConversationRepoDep = Annotated[ConversationRepo, Depends(get_conversation_repo)]
AuthVerifierDep = Annotated[AuthVerifier, Depends(get_auth_verifier)]


def get_conversation_service(repo: ConversationRepoDep, value_of_use: ValueOfUseDep) -> ConversationService:
    return ConversationService(repo, value_of_use, load_bundle())


ConversationServiceDep = Annotated[ConversationService, Depends(get_conversation_service)]
