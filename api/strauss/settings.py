"""Runtime settings, read from environment variables (.env.local locally, Vercel env in the cloud)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")

    environment: str = "local"
    supabase_url: str = ""
    supabase_secret_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""
    groq_api_key: str = ""
    llm_chain: str = "google-gla:gemini-2.5-flash"

    @property
    def configured(self) -> dict[str, bool]:
        """Which integrations have credentials - never exposes the values themselves."""
        return {
            "supabase": bool(self.supabase_url and self.supabase_secret_key),
            "gemini": bool(self.gemini_api_key),
            "openrouter": bool(self.openrouter_api_key),
            "groq": bool(self.groq_api_key),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
