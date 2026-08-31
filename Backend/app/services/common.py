"""Small cross-domain service helpers with no home in a domain module."""

from __future__ import annotations

from typing import TypeVar

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

_T = TypeVar("_T")


def get_or_404(db: Session, model: type[_T], pk: str, detail: str) -> _T:
    """Load `model` by primary key, raising 404 with `detail` when absent.

    The shared body behind the domain-named `_get_<thing>_or_404` route
    helpers and `services.pieces.get_piece_or_404` /
    `services.groups.get_group_or_404`, which stay as thin wrappers so each
    call site and its error string live in exactly one place.
    """
    obj = db.get(model, pk)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return obj
