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
    # Read-only, version-controlled piece source files (the repo root's
    # `Fixtures/`, copied into the image at `./fixtures` by the Dockerfile —
    # see render.yaml's `dockerContext`). Distinct from `storage_dir`
    # (user-uploaded files, writable, wiped on every Render free-tier
    # restart/redeploy): a `PieceVersion.file_path` starting with
    # `fixtures/` resolves against this instead, so bundled demo pieces
    # survive redeploys without needing real object storage. See
    # `app/storage/files.py`'s `resolve_source_path`.
    fixtures_dir: str = "./fixtures"

    # Neon Object Storage (S3-compatible) — the durable home for
    # user-uploaded piece files, so they survive the free-tier ephemeral
    # disk wipe that `storage_dir` doesn't. Populated from the AWS-standard
    # env vars a Neon storage credential hands you (`neon env pull`, or the
    # Console's "Download .env"); `S3_BUCKET` names the bucket
    # (`uploads` on the project's `production` branch). All four AWS_* values
    # unset → `object_storage_enabled` is False and everything falls back to
    # local disk exactly as before (tests, local dev without credentials).
    # Field names are the lowercased env vars — pydantic-settings matches
    # them case-insensitively, so `AWS_ENDPOINT_URL_S3` fills
    # `aws_endpoint_url_s3` with no alias needed.
    aws_endpoint_url_s3: str = ""
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "us-east-2"
    s3_bucket: str = "uploads"

    @property
    def object_storage_enabled(self) -> bool:
        return bool(
            self.aws_endpoint_url_s3
            and self.aws_access_key_id
            and self.aws_secret_access_key
            and self.s3_bucket
        )

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

    # Where a password-reset link points — the deployed Frontend origin in
    # production (set via Render env var), the local dev server otherwise.
    frontend_base_url: str = "http://localhost:5173"

    # OAuth app credentials (Google/Apple Sign-In) — empty by default, which
    # is exactly what makes `/auth/oauth/*` report each provider as
    # unconfigured (501) instead of attempting a real handshake it can't
    # complete. Real values are a human step (create the app in Google
    # Cloud Console / Apple Developer, paste the id/secret in as env vars)
    # — see Backend/plan.md's Backlog.
    google_client_id: str = ""
    google_client_secret: str = ""
    apple_client_id: str = ""
    apple_client_secret: str = ""

    @property
    def oauth_configured(self) -> dict[str, bool]:
        return {
            "google": bool(self.google_client_id and self.google_client_secret),
            "apple": bool(self.apple_client_id and self.apple_client_secret),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
