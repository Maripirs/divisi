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

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.schemas import GuestGroupOut, GuestPieceOut, HomeworkOut, RenderManifestOut
from app.core.rate_limit import rate_limit_guest
from app.core.security import verify_password
from app.db.models import Distribution, Group, Homework, Piece, PieceVersion
from app.db.session import get_db
from app.rendering.pipeline import RenderError, is_midi_file, render_file_path, render_manifest
from app.storage.files import resolve_source_path

router = APIRouter(prefix="/guest", tags=["guest"], dependencies=[Depends(rate_limit_guest)])


def _get_group_by_join_code_or_404(join_code: str, db: Session) -> Group:
    group = db.query(Group).filter(Group.join_code == join_code).first()
    if group is None:
        # Deliberately the same generic message an unauthenticated caller
        # would see for any other bad code — nothing here should help
        # distinguish "wrong code" from "code for a group with no pieces".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join code not found")
    return group


def _check_guest_password(group: Group, password: str | None) -> None:
    """B10: if the group's admin set a guest password, every route below
    requires it — a leaked join-code link alone shouldn't be enough. One
    generic message either way (missing vs. wrong) rather than
    distinguishing them; nothing meaningful is gained by telling an
    unauthorized caller which case they're in."""
    if group.guest_password_hash is None:
        return
    if password is None or not verify_password(password, group.guest_password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect or missing group password")


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
def resolve_join_code(join_code: str, password: str | None = None, db: Session = Depends(get_db)) -> GuestGroupOut:
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)

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


@router.get("/{join_code}/homework", response_model=list[HomeworkOut])
def list_guest_homework(join_code: str, password: str | None = None, db: Session = Depends(get_db)) -> list[Homework]:
    """Read-only, same no-auth stance as the rest of this router — a
    homework assignment (title/range/instructions/due date) carries no more
    sensitivity than the piece titles already exposed above, so it's
    scoped by join code the same way, no membership required. Also gated
    by B10's `guest_homework_visible` flag (default off) — unlike pieces,
    an admin may not want assignments visible to non-members at all, even
    ones who have the join code/password."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    if not group.guest_homework_visible:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Homework not available for this group")
    return (
        db.query(Homework)
        .filter(Homework.group_id == group.id)
        .order_by(Homework.due_date.asc().nulls_last(), Homework.created_at.asc())
        .all()
    )


@router.get("/{join_code}/pieces/{piece_id}/manifest", response_model=RenderManifestOut)
def get_guest_piece_manifest(
    join_code: str, piece_id: str, password: str | None = None, db: Session = Depends(get_db)
) -> RenderManifestOut:
    """Same manifest shape/pipeline as the authenticated
    `/library/versions/{id}/manifest` (B7) — scoped here to whatever
    version this group actually has distributed for this piece, rather
    than trusting a client-supplied version id."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    if not is_midi_file(version.file_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This version's file isn't a MIDI file")

    source_path = resolve_source_path(version.file_path)
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
def get_guest_render_file(
    join_code: str, piece_id: str, filename: str, password: str | None = None, db: Session = Depends(get_db)
) -> FileResponse:
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    try:
        path = render_file_path(version.id, filename)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path)
