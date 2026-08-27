"""File storage abstraction.

Local-disk implementation for MVP; swap for S3 (or similar) later without
touching callers — see Backend/plan.md backlog.
"""

from pathlib import Path
from uuid import uuid4

from app.core.config import get_settings


def save_file(data: bytes, suffix: str = "") -> str:
    """Persist bytes to local disk, return a storage-relative path."""
    settings = get_settings()
    root = Path(settings.storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    name = f"{uuid4().hex}{suffix}"
    (root / name).write_bytes(data)
    return name


FIXTURES_PREFIX = "fixtures/"


def resolve_source_path(file_path: str) -> Path:
    """A `PieceVersion.file_path` resolves against one of two roots: the
    writable `storage_dir` (user uploads, wiped on every Render free-tier
    restart) by default, or the read-only, version-controlled
    `fixtures_dir` when `file_path` starts with `fixtures/` (bundled demo
    pieces — see `Settings.fixtures_dir`'s doc comment). Every caller that
    used to build `Path(settings.storage_dir) / version.file_path`
    directly should go through this instead."""
    settings = get_settings()
    if file_path.startswith(FIXTURES_PREFIX):
        return Path(settings.fixtures_dir) / file_path[len(FIXTURES_PREFIX):]
    return Path(settings.storage_dir) / file_path


def load_file(path: str) -> bytes:
    return resolve_source_path(path).read_bytes()
