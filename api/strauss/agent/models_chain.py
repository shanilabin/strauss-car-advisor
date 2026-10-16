"""The model chain: several free Gemini models, then Groq, then OpenRouter - each only if its key is set.

LLM_CHAIN lists "provider:model" entries in order, e.g.
    google:gemini-3.6-flash,google:gemini-3.5-flash,groq:openai/gpt-oss-120b
(only the first ':' separates provider from model, since OpenRouter ids contain ':').

Gemini's free tier allows about 20 requests a day per model, and a turn takes 2-4 requests - so the chain
lists several Gemini models (each has its own quota) before moving to another provider. SDK retries are
off, so a rate-limited model hands over to the next one immediately instead of backing off.
"""

from openai import AsyncOpenAI
from pydantic_ai.models import Model
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.google import GoogleProvider
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.openrouter import OpenRouterProvider

from strauss.settings import Settings

GOOGLE = {"google", "google-gla"}  # "google-gla" is PydanticAI's own name for the Gemini API
GROQ_URL = "https://api.groq.com/openai/v1"
OPENROUTER_URL = "https://openrouter.ai/api/v1"


class AgentUnavailable(RuntimeError):
    """No model can be used (no keys, or every provider failed) - the UI switches to form mode."""


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
    return models[0] if len(models) == 1 else FallbackModel(models[0], *models[1:])
