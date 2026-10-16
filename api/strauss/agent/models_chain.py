"""The model chain: Gemini first, then OpenRouter's free models - each only if its key is configured.

LLM_CHAIN lists "provider:model" entries in order, e.g.
    google:gemini-2.5-flash,openrouter:meta-llama/llama-3.3-70b-instruct:free
(only the first ':' separates provider from model, since OpenRouter ids contain ':').
The SDKs' own retries are off so a rate-limited provider hands over to the next one immediately.
"""

from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider

from strauss.settings import Settings


class AgentUnavailable(RuntimeError):
    """No model can be used (no keys, or every provider failed) - the UI switches to form mode."""


def _one(provider: str, model_name: str, settings: Settings) -> Model | None:
    if provider == "google" and settings.gemini_api_key:
        return GoogleModel(model_name, provider=GoogleProvider(api_key=settings.gemini_api_key))
    if provider == "openrouter" and settings.openrouter_api_key:
        openrouter = OpenRouterProvider(api_key=settings.openrouter_api_key, app_title="Strauss car advisor")
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
            "לא הוגדר אף ספק מודל עם מפתח (LLM_CHAIN / GEMINI_API_KEY / OPENROUTER_API_KEY)"
        )
    return models[0] if len(models) == 1 else FallbackModel(models[0], *models[1:])
