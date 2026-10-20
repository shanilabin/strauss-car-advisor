"""The model chain: several free Gemini models, then Groq, then OpenRouter - each only if its key is set.

LLM_CHAIN lists "provider:model" entries in order, e.g.
    google:gemini-3.6-flash,google:gemini-3.5-flash,groq:openai/gpt-oss-120b
(only the first ':' separates provider from model, since OpenRouter ids contain ':').

Gemini's free tier allows about 20 requests a day per model, and a turn takes 2-4 requests - so the chain
lists several Gemini models (each has its own quota) before moving to another provider. SDK retries are
off, so a rate-limited model hands over to the next one immediately instead of backing off.

A model that just answered 429 (quota) or timed out is skipped for a while: otherwise every request of
every turn - a turn makes 2-5 - would first knock on the same exhausted models again, costing time (and,
for a model that hangs, its whole timeout) before reaching one that answers.
"""

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any

from openai import AsyncOpenAI
from pydantic_ai import RunContext
from pydantic_ai.exceptions import ModelAPIError, ModelHTTPError
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models import Model, ModelRequestParameters, StreamedResponse
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.models.wrapper import WrapperModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider
from pydantic_ai.settings import ModelSettings

from strauss.settings import Settings

GOOGLE = {"google", "google-gla"}  # "google-gla" is PydanticAI's own name for the Gemini API
GROQ_URL = "https://api.groq.com/openai/v1"
OPENROUTER_URL = "https://openrouter.ai/api/v1"


class AgentUnavailable(RuntimeError):
    """No model can be used (no keys, or every provider failed) - the UI switches to form mode."""


QUOTA_PAUSE_SECONDS = 10 * 60  # a 429 is usually a daily or per-minute quota - try others meanwhile
FAILURE_PAUSE_SECONDS = 2 * 60  # a timeout or an outage


class Cooldowns:
    """Which models of one chain are resting, and until when. Shared by the chain's models."""

    def __init__(self) -> None:
        self.until: dict[str, float] = {}
        self.members: list[str] = []

    def rest(self, key: str, seconds: float) -> None:
        self.until[key] = time.monotonic() + seconds

    def skip(self, key: str) -> bool:
        """Resting - and some other model of the chain is not, so skipping still leaves one to try."""
        now = time.monotonic()
        if self.until.get(key, 0) <= now:
            return False
        return any(self.until.get(other, 0) <= now for other in self.members if other != key)


class CoolingModel(WrapperModel):
    """A chain member that steps aside for a while after a quota error or a timeout."""

    def __init__(self, wrapped: Model, key: str, board: Cooldowns) -> None:
        super().__init__(wrapped)
        self.key = key
        self.board = board
        board.members.append(key)

    def _check(self) -> None:
        if self.board.skip(self.key):
            raise ModelHTTPError(429, self.model_name, "skipped: rate-limited or failing a moment ago")

    def _failed(self, exc: ModelAPIError) -> None:
        quota = isinstance(exc, ModelHTTPError) and exc.status_code == 429
        self.board.rest(self.key, QUOTA_PAUSE_SECONDS if quota else FAILURE_PAUSE_SECONDS)

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        self._check()
        try:
            return await super().request(messages, model_settings, model_request_parameters)
        except ModelAPIError as exc:
            self._failed(exc)
            raise

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: RunContext[Any] | None = None,
    ) -> AsyncGenerator[StreamedResponse]:
        self._check()
        try:
            async with super().request_stream(
                messages, model_settings, model_request_parameters, run_context
            ) as stream:
                yield stream
        except ModelAPIError as exc:
            self._failed(exc)
            raise


def _no_retries(base_url: str, api_key: str, **headers: str) -> AsyncOpenAI:
    return AsyncOpenAI(base_url=base_url, api_key=api_key, max_retries=0, default_headers=headers or None)


def _one(provider: str, model_name: str, settings: Settings) -> Model | None:
    if provider in GOOGLE and settings.gemini_api_key:
        return GoogleModel(model_name, provider=GoogleProvider(api_key=settings.gemini_api_key))
    if provider == "groq" and settings.groq_api_key:
        groq = OpenAIProvider(openai_client=_no_retries(GROQ_URL, settings.groq_api_key))
        return OpenAIChatModel(model_name, provider=groq)
    if provider == "openrouter" and settings.openrouter_api_key:
        client = _no_retries(
            OPENROUTER_URL, settings.openrouter_api_key, **{"X-Title": "Strauss car advisor"}
        )
        openrouter = OpenRouterProvider(openai_client=client)
        return OpenAIChatModel(model_name, provider=openrouter)
    return None


def build_model(settings: Settings) -> Model:
    models: list[Model] = []
    for entry in (e.strip() for e in settings.llm_chain.split(",")):
        if not entry:
            continue
        provider, _, model_name = entry.partition(":")
        model = _one(provider, model_name, settings)
        if model is not None:
            models.append(model)
    if not models:
        raise AgentUnavailable(
            "לא הוגדר אף ספק מודל עם מפתח (LLM_CHAIN / GEMINI_API_KEY / GROQ_API_KEY / OPENROUTER_API_KEY)"
        )
    if len(models) == 1:
        return models[0]
    board = Cooldowns()
    cooling = [CoolingModel(m, f"{m.system}:{m.model_name}#{i}", board) for i, m in enumerate(models)]
    return FallbackModel(cooling[0], *cooling[1:])
