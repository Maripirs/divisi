"""Admin-triggered "Generate lyrics from PDF" route.

Pulls sung lyrics off a piece's current version's PDF text layer and
injects them into its MusicXML as `<lyric>` elements, then lands the
result as a new `PieceVersion` -- immediately published (submit ->
approve -> distribute in one step via `publish_version`), same
"admin clicks a button, gets an improved version" convention the Tracks
tab's `uploadTrack`/`updatePieceDetails` already follow. Unlike the OMR
pipeline (a full transcription redo, hence its own draft-and-review
step), this only ever *adds* lyric annotations on top of already-approved
note/rhythm data -- it never touches pitches, durations, or measures --
so it doesn't carry the same risk that draft review guards against.

Runs synchronously in the request: no job queue. Groq calls are fast and
the files involved are small; a real job queue for heavier work is
tracked separately in PLAN.md's backlog.

MusicXML/`.mxl`-sourced pieces only -- a MIDI-sourced piece's current
version is refused with a clear 400, detected via the same 4-byte `MThd`
magic byte-sniff the Frontend's `loadRemoteMusicFile` already uses
client-side (`Frontend/src/lib/pieces/remotePiece.ts`).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from music21 import converter
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import PieceVersionOut
from app.db.models import User, VersionSource
from app.db.session import get_db
from app.lyrics.extract import NoTextLayerError, extract_word_tokens
from app.lyrics.groq_client import LyricExtractionError, classify_lyric_tokens
from app.lyrics.inject import count_singable_onsets, inject_lyrics
from app.services.pieces import add_version, live_version, publish_version
from app.storage.files import resolve_existing_source_path, save_file

from ._common import _get_piece_or_404, _require_review_authority

router = APIRouter()

_MIDI_MAGIC = b"MThd"


@router.post(
    "/pieces/{piece_id}/generate-lyrics",
    response_model=PieceVersionOut,
    status_code=status.HTTP_201_CREATED,
)
def generate_lyrics(
    piece_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PieceVersionOut:
    piece = _get_piece_or_404(piece_id, db)
    _require_review_authority(piece, current_user, db)

    version = live_version(piece, db)
    if version is None or not version.file_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This piece has no music file to generate lyrics for",
        )
    if not version.pdf_file_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This piece has no PDF to read lyrics from",
        )

    try:
        music_path = resolve_existing_source_path(version.file_path)
        pdf_path = resolve_existing_source_path(version.pdf_file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This piece's music file or PDF is missing from storage",
        ) from exc

    with open(music_path, "rb") as handle:
        is_midi = handle.read(len(_MIDI_MAGIC)) == _MIDI_MAGIC
    if is_midi:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lyric generation isn't supported for MIDI-sourced pieces yet.",
        )

    try:
        score = converter.parse(str(music_path))
    except Exception as exc:  # noqa: BLE001 - any parse failure just means "not usable here"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not parse this piece's music file as MusicXML: {exc}",
        ) from exc

    try:
        tokens = extract_word_tokens(str(pdf_path))
    except NoTextLayerError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    # Ground truth from the score itself, computed before Groq ever sees
    # anything: exactly how many sung notes each voice has. Passed through
    # as a running per-voice budget in the classification prompt, and
    # logged if the final counts still look off -- see
    # `classify_lyric_tokens`'s own doc comment for why this exists (a
    # real, observed classification-drift failure, not a hypothetical).
    onset_counts = count_singable_onsets(score)

    try:
        voices = classify_lyric_tokens(tokens, onset_counts)
    except LyricExtractionError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc)) from exc

    written = inject_lyrics(score, voices)
    if written == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not match any lyrics to a note in this piece's voice parts",
        )

    out_path = score.write("musicxml")
    try:
        musicxml_bytes = Path(out_path).read_bytes()
    finally:
        Path(out_path).unlink(missing_ok=True)

    new_file_path = save_file(musicxml_bytes, suffix=".musicxml")
    stem = Path(version.file_name).stem if version.file_name else piece.title
    new_version = add_version(
        piece=piece,
        created_by=current_user.id,
        file_path=new_file_path,
        pdf_file_path=version.pdf_file_path,
        file_name=f"{stem}-lyrics.musicxml",
        pdf_file_name=version.pdf_file_name,
        source=VersionSource.modification,
        db=db,
    )
    return publish_version(new_version, current_user, db)
