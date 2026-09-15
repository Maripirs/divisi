"""File storage abstraction.

A stored file path resolves against one of three backends:

- **`fixtures/…`** — read-only, version-controlled demo pieces baked into
  the image at `fixtures_dir` (see `Settings.fixtures_dir`). Never written
  here.
- **`obj/…`** — an object stored in Neon Object Storage (S3-compatible).
  This is where `save_file` puts new user uploads whenever
  `Settings.object_storage_enabled` is true, so they survive the Render
  free-tier disk wipe. Served by first materializing to a local cache
  under `storage_dir/_object_cache/` (ephemeral — fine, it's a cache).
- **anything else** — a path under the writable `storage_dir`: legacy
  uploads from before the object-storage swap (their bytes are gone if a
  restart wiped the disk — callers get a clean 404, see
  `resolve_existing_source_path`), OMR job working files, the render
  cache, and every upload made while `object_storage_enabled` is false
  (tests, local dev without credentials).
"""

import logging
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings

FIXTURES_PREFIX = "fixtures/"
OBJECT_PREFIX = "obj/"

logger = logging.getLogger("divisi.storage")


@lru_cache
def _s3_client():
    """A boto3 S3 client pointed at Neon Object Storage. Cached — the
    credentials come from process env / `.env` via `get_settings()` and
    don't change within a run. Path-style addressing is required by Neon."""
    import boto3
    from botocore.config import Config

    settings = get_settings()
    return boto3.client(
        "s3",
        endpoint_url=settings.aws_endpoint_url_s3,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        region_name=settings.aws_region or "us-east-2",
        config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def save_file(data: bytes, suffix: str = "") -> str:
    """Persist bytes and return the storage path to record on the model.

    Goes to Neon Object Storage (returning an `obj/…` key) when it's
    configured, else to local disk (returning a bare name) exactly as
    before."""
    name = f"{uuid4().hex}{suffix}"
    if get_settings().object_storage_enabled:
        key = f"{OBJECT_PREFIX}{name}"
        _s3_client().put_object(Bucket=get_settings().s3_bucket, Key=key, Body=data)
        return key
    root = Path(get_settings().storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    (root / name).write_bytes(data)
    return name


def _materialize_object(key: str) -> Path:
    """Download an `obj/…` file from object storage into the local cache
    and return its path. Raises `FileNotFoundError` when the object is
    gone, so callers can turn that into a 404 rather than a 500."""
    from botocore.exceptions import ClientError

    settings = get_settings()
    cache_path = Path(settings.storage_dir) / "_object_cache" / key[len(OBJECT_PREFIX):]
    if cache_path.is_file():
        return cache_path

    try:
        obj = _s3_client().get_object(Bucket=settings.s3_bucket, Key=key)
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code in {"NoSuchKey", "NoSuchBucket", "404"}:
            raise FileNotFoundError(key) from exc
        raise

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache_path.with_name(cache_path.name + ".part")
    tmp.write_bytes(obj["Body"].read())
    tmp.replace(cache_path)
    return cache_path


def resolve_source_path(file_path: str) -> Path:
    """Map a stored path to a local filesystem path. `fixtures/…` resolves
    against the read-only `fixtures_dir`; `obj/…` is fetched from object
    storage into the local cache; everything else is `storage_dir`-relative.
    Every caller that used to build `Path(settings.storage_dir) /
    version.file_path` directly should go through this instead."""
    settings = get_settings()
    if file_path.startswith(FIXTURES_PREFIX):
        return Path(settings.fixtures_dir) / file_path[len(FIXTURES_PREFIX):]
    if file_path.startswith(OBJECT_PREFIX):
        return _materialize_object(file_path)
    return Path(settings.storage_dir) / file_path


def resolve_existing_source_path(file_path: str) -> Path:
    """`resolve_source_path`, but raises `FileNotFoundError` when the file
    isn't actually there — a missing object, or a legacy local upload lost
    to an ephemeral-disk wipe. Routes catch this and return a clean 404
    instead of letting `FileResponse` raise a 500 on a non-existent path."""
    path = resolve_source_path(file_path)
    if not path.is_file():
        raise FileNotFoundError(file_path)
    return path


def load_file(path: str) -> bytes:
    return resolve_source_path(path).read_bytes()


def delete_file(path: str | None) -> None:
    """Reclaim a stored file's bytes when the row that pointed at it is
    gone (e.g. `delete_piece` on its versions' `file_path`/`pdf_file_path`).
    No-op on `None`/empty (a slot that was never filled) and on anything
    under `FIXTURES_PREFIX` (read-only, version-controlled, never touched).
    Best-effort throughout: reclaiming storage is far less important than
    whatever caller triggered the delete, so every failure here is caught
    and logged rather than raised."""
    if not path or path.startswith(FIXTURES_PREFIX):
        return
    settings = get_settings()
    if path.startswith(OBJECT_PREFIX):
        if settings.object_storage_enabled:
            try:
                _s3_client().delete_object(Bucket=settings.s3_bucket, Key=path)
            except Exception:
                logger.warning("Failed to delete object storage file %s", path, exc_info=True)
        cache_path = Path(settings.storage_dir) / "_object_cache" / path[len(OBJECT_PREFIX):]
        try:
            cache_path.unlink(missing_ok=True)
        except OSError:
            logger.warning("Failed to remove cached copy of %s", path, exc_info=True)
        return
    # Legacy local-disk path (pre object-storage upload, or any write made
    # while `object_storage_enabled` is false).
    try:
        (Path(settings.storage_dir) / path).unlink(missing_ok=True)
    except OSError:
        logger.warning("Failed to delete local storage file %s", path, exc_info=True)
