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


def load_file(path: str) -> bytes:
    settings = get_settings()
    return (Path(settings.storage_dir) / path).read_bytes()
