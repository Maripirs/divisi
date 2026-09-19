from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, sourced from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg2://divisi:divisi@localhost:5432/divisi"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24
    # B10: lifetime of the stateless guest token minted by
    # POST /guest/{join_code}/auth after a guest-password check. Long
    # (30 days) because the frontend stores it in an httpOnly cookie and
    # forwards it on every guest route in place of re-sending the password.
    guest_token_expire_minutes: int = 60 * 24 * 30
    # B19: lifetime of the `divisi_participant` device token. One year:
    # until the singer runs "Save across devices" this token is their only
    # identity, so a short expiry would silently orphan every signup /
    # annotation they made.
    participant_token_expire_minutes: int = 60 * 24 * 365
    # bcrypt work factor for password hashing. 12 is a sane production
    # default (~0.4s/hash). Tests set BCRYPT_ROUNDS=4 via the root
    # conftest.py so the auth-heavy suite isn't dominated by hashing
    # (~7.5min -> ~40s); 4 is bcrypt's minimum and fine for throwaway
    # in-memory test users.
    bcrypt_rounds: int = 12
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
    # multi-page PDFs natively, correctly recovers multi-part structure
    # and lyrics via OCR); "oemer" is a single-page-only fallback whose
    # output flattens all staves into one part with no lyrics. Neither
    # binary ships with the app — see Backend/README.md's OMR section for
    # the local install recipe (verified working on macOS).
    omr_engine: str = "audiveris"
    audiveris_bin: str = "audiveris"
    oemer_bin: str = "oemer"
    # B16: a PDF with more than one page is transcribed page-by-page and
    # re-merged (see app/omr/paged.py) so one bad page doesn't sink the
    # whole book export, which is Audiveris's all-or-nothing default.
    # A single-page input, or the case where Audiveris isn't installed,
    # falls back to the B8 single-run pipeline.
    omr_paged_multipage: bool = True
    # DPI when rasterizing a page for oemer (which only takes images).
    oemer_dpi: int = 300
    # Audiveris's own per-step timeout (its `sheetStepTimeOut` constant)
    # defaults to 120s, which real (non-trivial) scores routinely exceed —
    # e.g. HEADERS (OCR-based clef/key/time recognition) and HEADS took
    # several minutes each on a real 4-part choral PDF during B8 testing.
    # 120s isn't a sandbox/CPU artifact, it's just too tight for dense
    # content in general, so this is passed through on every run rather
    # than left at Audiveris's default.
    audiveris_step_timeout_seconds: int = 1800

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

    # Lyric generation (admin-triggered "Generate lyrics from PDF" button,
    # Backend/app/lyrics/): Groq's OpenAI-compatible chat-completions
    # endpoint classifies a PDF's raw text-layer word tokens into per-voice
    # sung syllables. Empty key -> the feature fails with a clear "not
    # configured" error rather than silently no-op'ing; the real key lives
    # on Render only (added directly via the Render API), never checked in.
    groq_api_key: str = ""
    # The prose-only JSON extraction shape (no response_format param) was
    # proven against llama-3.3-70b-versatile in a sibling project,
    # `~/projects/walkcode/server/llm.js`, but that model has since been
    # retired from Groq's lineup (confirmed via GET /v1/models against the
    # real key on 2026-09-15: a live call to it 404s with "model_not_found").
    # openai/gpt-oss-120b is a current model on the same key that returns
    # clean single-JSON-object content (verified with a live smoke call).
    groq_lyrics_model: str = "openai/gpt-oss-120b"

    # Fallback provider for lyric generation when Groq's rate limit (either
    # the per-minute or the account's separate per-day cap) blocks a chunk
    # -- hit the per-day cap for real while testing this feature (200,000
    # tokens/day on this account, exhausted by a day of iteration). Empty
    # key -> the fallback is simply skipped and a Groq failure surfaces as
    # normal; nothing about the feature requires this to be configured.
    # nemotron-3.5-lightning-30b-a3b: confirmed live on NVIDIA's catalog
    # (GET /v1/models), no deprecation header (unlike nemotron-3-super-
    # 120b-a12b, which 2026-10-03-deprecates), and verified end-to-end
    # against a real piece with `chat_template_kwargs: {"thinking": false}`
    # (see groq_client.py's `_nvidia_body` -- without it, this is a
    # reasoning model that narrates its whole chain-of-thought directly in
    # `content` with no separate field to skip past, unlike Groq's
    # gpt-oss-120b).
    nvidia_api_key: str = ""
    nvidia_lyrics_model: str = "nvidia/nemotron-3.5-lightning-30b-a3b"

    # AI-assisted measure-range edits (admin-triggered "AI edit" button,
    # Backend/app/scoreedit/): a second, more general Groq-backed editing
    # tool, deliberately Groq-only with no NVIDIA fallback (see
    # `app/scoreedit/client.py`'s own doc comment for why a less-reliable
    # fallback provider is an acceptable trade for lyrics but not for
    # pitch/rhythm content). Reuses `groq_api_key` above, same account.
    groq_score_edit_model: str = "openai/gpt-oss-120b"

    # Resend (email provider) for the carpool match notification (B33): a
    # post owner who opted in a `contact_email` gets emailed when a rider
    # claims their seat or a driver expresses interest in their request
    # (`app.services.email.send_email`, called from `app/api/routes/
    # carpool.py`'s `create_claim`/`create_interest`). Empty key -> a clean
    # no-op (logged, not raised), same "unconfigured means skip" shape as
    # `groq_api_key`/the OAuth credentials above. Real values live in
    # `.env` locally / Render in prod, never checked in.
    resend_api_key: str = ""
    # The verified "From" address for those emails, e.g. "Divisi Carpool
    # <carpool@divisi.maripi.net>": Resend requires the sending domain be
    # verified on the account before mail from it will actually deliver.
    resend_from_email: str = ""

    # B20: the one group (if any) that offers a public, read-only "preview
    # Admin" mode from its guest join page — the seeded public demo choir
    # (see Backend/scripts/seed_demo.py, Backend/DEMO_SETUP.md), never a
    # real conductor's group. Empty (the default) turns the feature off
    # everywhere: no join code can ever match. Set on Render only after the
    # demo group's join code is hand-set (see DEMO_SETUP.md's Step 3).
    demo_join_code: str = ""

    @property
    def oauth_configured(self) -> dict[str, bool]:
        return {
            "google": bool(self.google_client_id and self.google_client_secret),
            "apple": bool(self.apple_client_id and self.apple_client_secret),
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
