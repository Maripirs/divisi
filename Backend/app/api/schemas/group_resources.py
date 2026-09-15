"""A group's stable link list (rehearsal playlist, member portal, shared
drive folder, a standing join link, ...) — see `app/db/models.py`'s
`GroupResource`."""

from datetime import datetime
from urllib.parse import urlsplit

from pydantic import BaseModel, field_validator

# Only http/https absolute URLs — mirrors the same restriction the weekly
# note markdown renderer already applies to `[text](url)` links (see
# `Frontend/src/lib/utils/noteMarkdown.ts`), so a resource link can't be a
# `javascript:`/`data:` URL or a bare relative path with no real host.
_ALLOWED_SCHEMES = {"http", "https"}


def _validate_absolute_url(value: str) -> str:
    value = value.strip()
    parts = urlsplit(value)
    if parts.scheme not in _ALLOWED_SCHEMES or not parts.netloc:
        raise ValueError("Must be an absolute http:// or https:// URL")
    return value


class GroupResourceCreate(BaseModel):
    label: str
    url: str

    @field_validator("url")
    @classmethod
    def _url_is_absolute(cls, value: str) -> str:
        return _validate_absolute_url(value)


class GroupResourceUpdate(BaseModel):
    """Partial update (unlike `WeeklyNoteUpdate`'s full replace): either
    field alone can change without the caller having to resend the other."""

    label: str | None = None
    url: str | None = None

    @field_validator("url")
    @classmethod
    def _url_is_absolute(cls, value: str | None) -> str | None:
        return _validate_absolute_url(value) if value is not None else None


class GroupResourceOut(BaseModel):
    id: str
    group_id: str
    label: str
    url: str
    created_by: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
