"""Guest access routes (B6): unauthenticated join-code entry into a group's
distributed pieces.

No `get_current_user` dependency anywhere in this router — that's the whole
point (see `Backend/plan.md`'s B6: choir members join a group's practice
tracks with no login, unless they want to save annotations later). Every
route is instead scoped by the join code -> its one `Group` -> that group's
actual `Distribution` rows, so a guest can never reach a piece id that
wasn't genuinely pushed to this group (no guessing a piece id into
arbitrary access). Rate-limited (`app/core/rate_limit.py`) as the
brute-force hardening called for in B6's plan.
"""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.schemas import GuestGroupOut, GuestPieceOut, RenderManifestOut
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_guest
from app.db.models import Distribution, Group, Piece, PieceVersion
from app.db.session import get_db
from app.rendering.pipeline import RenderError, is_midi_file, render_file_path, render_manifest

router = APIRouter(prefix="/guest", tags=["guest"], dependencies=[Depends(rate_limit_guest)])


def _get_group_by_join_code_or_404(join_code: str, db: Session) -> Group:
    group = db.query(Group).filter(Group.join_code == join_code).first()
    if group is None:
        # Deliberately the same generic message an unauthenticated caller
        # would see for any other bad code — nothing here should help
        # distinguish "wrong code" from "code for a group with no pieces".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join code not found")
    return group


def _latest_distributed_version(group_id: str, piece_id: str, db: Session) -> PieceVersion | None:
    row = (
        db.query(PieceVersion)
        .join(Distribution, Distribution.piece_version_id == PieceVersion.id)
        .filter(Distribution.group_id == group_id, PieceVersion.piece_id == piece_id)
        .order_by(Distribution.distributed_at.desc())
        .first()
    )
    return row


@router.get("/{join_code}", response_model=GuestGroupOut)
def resolve_join_code(join_code: str, db: Session = Depends(get_db)) -> GuestGroupOut:
    group = _get_group_by_join_code_or_404(join_code, db)

    distributed_rows = (
        db.query(Distribution, PieceVersion, Piece)
        .join(PieceVersion, Distribution.piece_version_id == PieceVersion.id)
        .join(Piece, PieceVersion.piece_id == Piece.id)
        .filter(Distribution.group_id == group.id)
        .order_by(Distribution.distributed_at.desc())
        .all()
    )
    seen_piece_ids: set[str] = set()
    pieces: list[GuestPieceOut] = []
    for distribution, version, piece in distributed_rows:
        if piece.id in seen_piece_ids:
            continue  # keep only the most recently distributed version per piece
        seen_piece_ids.add(piece.id)
        pieces.append(
            GuestPieceOut(
                piece_id=piece.id,
                title=piece.title,
                version_id=version.id,
                distributed_at=distribution.distributed_at,
            )
        )

    return GuestGroupOut(group_name=group.name, pieces=pieces)


@router.get("/{join_code}/pieces/{piece_id}/manifest", response_model=RenderManifestOut)
def get_guest_piece_manifest(join_code: str, piece_id: str, db: Session = Depends(get_db)) -> RenderManifestOut:
    """Same manifest shape/pipeline as the authenticated
    `/library/versions/{id}/manifest` (B7) — scoped here to whatever
    version this group actually has distributed for this piece, rather
    than trusting a client-supplied version id."""
    group = _get_group_by_join_code_or_404(join_code, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    if not is_midi_file(version.file_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This version's file isn't a MIDI file")

    settings = get_settings()
    source_path = Path(settings.storage_dir) / version.file_path
    try:
        manifest = render_manifest(version.id, source_path)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    base = f"/guest/{join_code}/pieces/{piece_id}/renders"
    return RenderManifestOut(
        piece_version_id=manifest["piece_version_id"],
        stems={name: f"{base}/{filename}" for name, filename in manifest["stems"].items()},
        musicxml_url=f"{base}/{manifest['musicxml']}",
        tempo_bpm=manifest["tempo_bpm"],
        time_signature=manifest["time_signature"],
        key_signature_fifths=manifest["key_signature_fifths"],
        ms_per_whole_note=manifest["ms_per_whole_note"],
        duration_ms=manifest["duration_ms"],
    )


@router.get("/{join_code}/pieces/{piece_id}/renders/{filename}")
def get_guest_render_file(join_code: str, piece_id: str, filename: str, db: Session = Depends(get_db)) -> FileResponse:
    group = _get_group_by_join_code_or_404(join_code, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    try:
        path = render_file_path(version.id, filename)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path)
