from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, sourced from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://divisi:divisi@localhost:5432/divisi"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    storage_dir: str = "./data/storage"

    # Frontend origins allowed to call this API cross-origin (browser CORS).
    # Comma-separated in the env var. Defaults cover the SvelteKit dev
    # server (both plain-HTTP and the self-signed-HTTPS mode vite.config.ts
    # uses for AudioWorklet support) plus the deployed Cloudflare domain.
    cors_origins: str = (
        "http://localhost:5173,https://localhost:5173,https://divisi.maripi.net"
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    # B8: OMR engine selection. "audiveris" is preferred (handles
    # multi-page PDFs natively); "oemer" is a single-page-only fallback.
    # Neither binary is installed by default — see Backend/plan.md's B8
    # human task (install path not yet decided).
    omr_engine: str = "audiveris"
    audiveris_bin: str = "audiveris"
    oemer_bin: str = "oemer"


@lru_cache
def get_settings() -> Settings:
    return Settings()
