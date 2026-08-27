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
