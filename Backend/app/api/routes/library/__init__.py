"""Library routes: pieces, versions, review, distribution.

A `Piece` is owned either by an individual user or by a group. New versions
start as `draft`; a member submits a draft for review, and only the review
authority for that piece (the group's admin, or the individual owner) can
approve or reject it. Only an `approved` version can be pushed (distributed)
to a group's members, and draft/rejected versions are never pushed — see the
domain model in Backend/plan.md.
"""

from fastapi import APIRouter

from . import files, pieces, versions

router = APIRouter(prefix="/library", tags=["library"])

router.include_router(pieces.router)
router.include_router(versions.router)
router.include_router(files.router)
