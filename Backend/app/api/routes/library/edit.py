"""Admin-triggered "AI edit" route: rewrite a selected measure range of a
piece's MusicXML from a plain-language instruction (`{"fix the alto
rhythm here"}`), and land the result as a new unpublished draft
`PieceVersion` -- the same working-draft slot "Generate lyrics from PDF"
uses (`app/api/routes/library/lyrics.py`), reviewed at the Frontend's
`piece/[id]/review` page the same way.

Edits whichever of the piece's own pending working draft or its live
version is currently being reviewed (a pending draft wins if one exists):
meant to complement whatever's already on screen, not compete with it for
the one-working-draft slot the way a second "Generate lyrics" click would
-- an admin reviewing a draft and spotting a wrong lyric in it should be
able to fix just that, refining the same draft, without discarding it
first. Each successful edit still replaces the previous draft (same
stale-draft-reject rule below), so the piece always has at most one
pending draft, just possibly a refined one.

Same shape as `generate_lyrics` throughout otherwise, on purpose (see
that route's own doc comment for the full reasoning, only summarized
here):
- Only one working-draft slot per piece: the draft this edit is based on
  (if any) is rejected and replaced by the edited result.
- Runs synchronously, no job queue -- one Groq call, not the many
  sequential ones lyric generation needs, so this is a much shorter wait.
- The FastAPI-injected `db` session is explicitly closed before the Groq
  call and never reused afterward; a fresh session
  (`app.db.session.SessionLocal`, not `from ... import SessionLocal` --
  see `generate_lyrics`'s comment on why that import shape matters for
  test monkeypatching) is opened just for the final write, so a
  multi-minute-idle session never has to survive a Neon connection Neon
  itself closed in the meantime.

Groq-only, no NVIDIA fallback (unlike lyrics): see
`app.scoreedit.client`'s own doc comment for why a less-reliable fallback
provider is an acceptable trade there but not for pitch/rhythm content.
A Groq failure here is a clean 502; the admin just retries the click.

v1's deliberate scope limit: the AI's replacement must cover the exact
same measure range and part count it was given -- adding/removing whole
measures is out of scope, and a shape mismatch is a clean 422
(`app.scoreedit.apply.SpliceValidationError`), never a best-effort
splice."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from music21 import converter, stream
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import EditMeasuresRequest, PieceVersionOut
from app.db import session as db_session
from app.db.models import Piece, User, VersionSource, VersionStatus
from app.db.session import get_db
from app.scoreedit.apply import SpliceValidationError, extract_range, splice_range
from app.scoreedit.client import ScoreEditError, edit_measures
from app.services.common import get_or_404
from app.services.pieces import add_version, live_version, working_draft
from app.storage.files import resolve_existing_source_path, save_file

from ._common import _get_piece_or_404, _require_review_authority

router = APIRouter()


@router.post(
    "/pieces/{piece_id}/edit-measures",
    response_model=PieceVersionOut,
    status_code=status.HTTP_201_CREATED,
)
def edit_measures_route(
    piece_id: str,
    body: EditMeasuresRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    piece = _get_piece_or_404(piece_id, db)
    _require_review_authority(piece, current_user, db)

    if body.measure_end < body.measure_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="measure_end must not be before measure_start",
        )
    if not body.message.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An instruction is required")

    # Edit whatever's currently being reviewed: a pending working draft (an
    # admin fixing something they spotted while reviewing it -- e.g. a
    # wrong lyric "Generate lyrics from PDF" produced) takes priority over
    # the live version, since that draft is what the Frontend's review
    # page is actually showing when one exists. This deliberately does NOT
    # require the piece to have no pending draft -- unlike generate-lyrics,
    # an AI edit is meant to complement/refine whatever's on screen, not
    # compete with it for the one-working-draft slot.
    version = working_draft(piece.id, db) or live_version(piece, db)
    if version is None or not version.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This piece has no music file to edit",
        )

    try:
        music_path = resolve_existing_source_path(version.file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This piece's music file is missing from storage",
        ) from exc

    # Everything needed from the DB is captured as plain values now; the
    # injected session is closed before the Groq call starts (see this
    # module's own doc comment for why).
    created_by = current_user.id
    version_pdf_file_path, version_file_name = version.pdf_file_path, version.file_name
    version_pdf_file_name = version.pdf_file_name
    db.close()

    try:
        score = converter.parse(str(music_path))
    except Exception as exc:  # noqa: BLE001 - any parse failure just means "not usable here"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not parse this piece's music file as MusicXML: {exc}",
        ) from exc

    fragment = extract_range(score, body.measure_start, body.measure_end)
    if not list(fragment.parts) or any(
        not list(part.getElementsByClass(stream.Measure)) for part in fragment.parts
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Measures {body.measure_start}-{body.measure_end} weren't found in this piece",
        )

    out_path = fragment.write("musicxml")
    try:
        fragment_xml = Path(out_path).read_text()
    finally:
        Path(out_path).unlink(missing_ok=True)

    try:
        replacement_xml = edit_measures(fragment_xml, body.message)
    except ScoreEditError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    try:
        splice_range(score, body.measure_start, body.measure_end, replacement_xml)
    except SpliceValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    out_path = score.write("musicxml")
    try:
        musicxml_bytes = Path(out_path).read_bytes()
    finally:
        Path(out_path).unlink(missing_ok=True)

    new_file_path = save_file(musicxml_bytes, suffix=".musicxml")

    # Fresh session and fresh ORM objects for the write -- see
    # `generate_lyrics`'s own comment (same module pattern this mirrors)
    # for why this goes through `app.db.session.SessionLocal` rather than
    # reusing the now-closed injected session.
    db = db_session.SessionLocal()
    try:
        piece = get_or_404(db, Piece, piece_id, "Piece not found")
        user = get_or_404(db, User, created_by, "User not found")

        # One working-draft slot per piece, shared with "Generate lyrics
        # from PDF" -- a rerun (or the other producer) replaces whatever
        # unreviewed draft is already sitting there rather than leaving
        # it orphaned.
        stale = working_draft(piece.id, db)
        if stale is not None:
            stale.status = VersionStatus.rejected
            stale.reviewed_by = user.id
            stale.reviewed_at = datetime.now(timezone.utc)
            db.flush()

        stem = Path(version_file_name).stem if version_file_name else piece.title
        return add_version(
            piece=piece,
            created_by=user.id,
            file_path=new_file_path,
            pdf_file_path=version_pdf_file_path,
            file_name=f"{stem}-edit.musicxml",
            pdf_file_name=version_pdf_file_name,
            source=VersionSource.modification,
            db=db,
        )
    finally:
        db.close()
