"""Runtime settings, read from environment variables (.env.local locally, Vercel env in the cloud)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from strauss.adapters.supabase_rest import API_URL


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    environment: str = "local"
    supabase_url: str = ""
    supabase_secret_key: str = ""
    gemini_api_key: str = ""
    # Optional: a key from a SEPARATE Google project, used only to read payslips, so reading payslips never
    # spends the chat's quota (and the other way round). Empty -> payslips use GEMINI_API_KEY.
    payslip_gemini_api_key: str = ""
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    # Gemini's free quota is per model (about 20 requests a day), so several are chained before Groq
    llm_chain: str = (
        "google:gemini-3.6-flash,google:gemini-3.8-flash,google:gemini-3.5-flash,"
        "google:gemini-3.5-flash-lite,groq:openai/gpt-oss-120b,groq:llama-3.3-70b-versatile,"
        "groq:meta-llama/llama-4-scout-17b-16e-instruct,openrouter:meta-llama/llama-3.3-70b-instruct:free"
    )

    @property
    def configured(self) -> dict[str, bool]:
        """Which integrations have credentials - never exposes the values themselves."""
        return {
            # a dashboard link or a typo is "not configured", not healthy
            "supabase": bool(API_URL.match(self.supabase_url) and self.supabase_secret_key),
            "gemini": bool(self.gemini_api_key),
            "payslip_gemini": bool(self.payslip_gemini_api_key),
            "openrouter": bool(self.openrouter_api_key),
            "groq": bool(self.groq_api_key),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


def payslip_settings(settings: Settings) -> Settings:
    """The chain for reading payslips: the same models, on the payslip key when there is one."""
    if not settings.payslip_gemini_api_key:
        return settings
    return settings.model_copy(update={"gemini_api_key": settings.payslip_gemini_api_key})
