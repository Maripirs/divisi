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

from app.api.schemas import (
    GuestGroupOut,
    GuestPieceOut,
    HomeworkOut,
    RenderManifestOut,
    ResponsibilityGuestDateOut,
    ResponsibilityGuestRoleCoverageOut,
    ResponsibilityGuestScheduleGroupOut,
    WeeklyNoteOut,
)
from app.core.rate_limit import rate_limit_guest
from app.core.security import verify_password
from app.db.models import (
    Distribution,
    Group,
    GroupPage,
    Homework,
    Piece,
    PieceVersion,
    ResponsibilityDate,
    ResponsibilityDateSchedule,
    ResponsibilityRole,
    ResponsibilitySchedule,
    WeeklyNote,
)
from app.db.session import get_db
from app.rendering.pipeline import RenderError, is_midi_file, render_file_path, render_manifest
from app.services.pages import require_guest_page_access
from app.services.responsibilities import role_coverage
from app.storage.files import resolve_existing_source_path

router = APIRouter(prefix="/guest", tags=["guest"], dependencies=[Depends(rate_limit_guest)])


def _source_path_or_404(file_path: str, what: str):
    """Local path for a stored file, 404ing (not 500ing) when the bytes are
    missing from storage. Mirrors `routes/library.py`'s helper."""
    try:
        return resolve_existing_source_path(file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{what} is missing from storage — it may need to be re-uploaded",
        ) from exc


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
    # B12: this route *is* the guest-facing "tracks" page (a group's
    # distributed pieces) — gated the same way homework is below, replacing
    # the old unconditional-for-guests behavior.
    require_guest_page_access(group.id, GroupPage.tracks, db)

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
                composer=piece.composer,
                youtube_url=piece.youtube_url,
                has_music=version.file_path is not None,
                has_pdf=version.pdf_file_path is not None,
            )
        )

    return GuestGroupOut(group_name=group.name, pieces=pieces)


@router.get("/{join_code}/homework", response_model=list[HomeworkOut])
def list_guest_homework(join_code: str, password: str | None = None, db: Session = Depends(get_db)) -> list[Homework]:
    """Read-only, same no-auth stance as the rest of this router — a
    homework assignment (title/range/instructions/due date) carries no more
    sensitivity than the piece titles already exposed above, so it's
    scoped by join code the same way, no membership required. Also gated
    by B12's `homework` page settings (default: enabled, members-only
    audience) — unlike tracks, homework isn't guest-visible by default
    even with the right join code/password."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    require_guest_page_access(group.id, GroupPage.homework, db)
    return (
        db.query(Homework)
        .filter(Homework.group_id == group.id)
        .order_by(Homework.due_date.asc().nulls_last(), Homework.created_at.asc())
        .all()
    )


@router.get("/{join_code}/weekly-notes", response_model=list[WeeklyNoteOut])
def list_guest_weekly_notes(join_code: str, password: str | None = None, db: Session = Depends(get_db)) -> list[WeeklyNote]:
    """Read-only, same no-auth stance as `list_guest_homework` above — a
    weekly note carries no more sensitivity than homework does (`created_by`
    is a bare id, never surfaced as a name), so it reuses `WeeklyNoteOut`
    as-is rather than a hidden-identity variant. Gated by the `weekly_notes`
    page settings, members-only audience by default."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    require_guest_page_access(group.id, GroupPage.weekly_notes, db)
    return (
        db.query(WeeklyNote)
        .filter(WeeklyNote.group_id == group.id)
        .order_by(WeeklyNote.note_date.desc(), WeeklyNote.created_at.desc())
        .all()
    )


@router.get("/{join_code}/responsibilities/dates", response_model=list[ResponsibilityGuestDateOut])
def list_guest_responsibility_dates(
    join_code: str, password: str | None = None, db: Session = Depends(get_db)
) -> list[ResponsibilityGuestDateOut]:
    """Read-only, same no-auth stance as the rest of this router. Unlike the
    member-facing `GET /groups/{id}/responsibilities/dates`, this never
    returns *who* signed up (see `ResponsibilityGuestRoleCoverageOut`):
    member names/emails aren't something a join-code link should hand out,
    only whether a role still needs people. A date can carry several role
    sets at once (`schedules`), each its own group of roles, with coverage
    rolled up across all of them. Gated by B12's `responsibilities` page
    settings, same mechanism as homework."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    require_guest_page_access(group.id, GroupPage.responsibilities, db)
    dates = (
        db.query(ResponsibilityDate)
        .join(ResponsibilityDateSchedule, ResponsibilityDateSchedule.date_id == ResponsibilityDate.id)
        .join(
            ResponsibilitySchedule,
            ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
        )
        .filter(ResponsibilitySchedule.group_id == group.id)
        .order_by(ResponsibilityDate.date.asc())
        .distinct()
        .all()
    )
    out: list[ResponsibilityGuestDateOut] = []
    for date in dates:
        schedules = (
            db.query(ResponsibilitySchedule)
            .join(
                ResponsibilityDateSchedule,
                ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
            )
            .filter(ResponsibilityDateSchedule.date_id == date.id)
            .order_by(ResponsibilityDateSchedule.created_at.asc())
            .all()
        )
        schedule_groups: list[ResponsibilityGuestScheduleGroupOut] = []
        for schedule in schedules:
            roles = (
                db.query(ResponsibilityRole)
                .filter(ResponsibilityRole.schedule_id == schedule.id)
                .order_by(ResponsibilityRole.created_at.asc())
                .all()
            )
            role_outs = []
            for role in roles:
                active_count, coverage_status, _signups = role_coverage(date.id, role, db)
                role_outs.append(
                    ResponsibilityGuestRoleCoverageOut(
                        role_id=role.id,
                        role_name=role.name,
                        needed_count=role.needed_count,
                        active_count=active_count,
                        status=coverage_status,
                    )
                )
            schedule_groups.append(
                ResponsibilityGuestScheduleGroupOut(schedule_name=schedule.name, roles=role_outs)
            )
        out.append(
            ResponsibilityGuestDateOut(
                id=date.id,
                date=date.date,
                notes=date.notes,
                locked=date.locked,
                canceled=date.canceled,
                schedules=schedule_groups,
            )
        )
    return out


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
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    if not is_midi_file(version.file_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This version's file isn't a MIDI file")

    source_path = _source_path_or_404(version.file_path, "This piece's music file")
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


@router.get("/{join_code}/pieces/{piece_id}/file")
def get_guest_piece_file(
    join_code: str, piece_id: str, password: str | None = None, db: Session = Depends(get_db)
) -> FileResponse:
    """F5: raw music-file bytes for this group's currently-distributed
    version of a piece. Same join-code/password/page-settings gate as the
    manifest route; 404s cleanly when that version has no music file."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")
    if version.file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no music file")
    return FileResponse(_source_path_or_404(version.file_path, "This piece's music file"))


@router.get("/{join_code}/pieces/{piece_id}/pdf")
def get_guest_piece_pdf(
    join_code: str, piece_id: str, password: str | None = None, db: Session = Depends(get_db)
) -> FileResponse:
    """Raw PDF bytes for this group's currently-distributed version of a
    piece. Same gate as the manifest route; 404s cleanly when that version
    has no PDF."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")
    if version.pdf_file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no PDF")
    return FileResponse(_source_path_or_404(version.pdf_file_path, "This piece's PDF"))


@router.get("/{join_code}/pieces/{piece_id}/renders/{filename}")
def get_guest_render_file(
    join_code: str, piece_id: str, filename: str, password: str | None = None, db: Session = Depends(get_db)
) -> FileResponse:
    group = _get_group_by_join_code_or_404(join_code, db)
    _check_guest_password(group, password)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    try:
        path = render_file_path(version.id, filename)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path)
