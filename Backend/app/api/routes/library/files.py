"""Library routes: serving version files, PDFs, and renders."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.schemas import RenderManifestOut
from app.db.models import User
from app.db.session import get_db
from app.rendering.pipeline import RenderError, is_midi_file, render_file_path, render_manifest
from app.storage.files import resolve_existing_source_path

from ._common import _get_piece_or_404, _get_version_or_404, _require_piece_access

router = APIRouter()


def _source_path_or_404(file_path: str, what: str):
    """Resolve a stored file to a local path, 404ing (not 500ing) when the
    bytes are missing — an object-storage miss, or a legacy local upload
    lost to a free-tier disk wipe. See `storage/files.py`."""
    try:
        return resolve_existing_source_path(file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{what} is missing from storage — it may need to be re-uploaded",
        ) from exc


@router.get("/versions/{version_id}/file")
def get_version_file(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """F5: raw music-file bytes (MIDI/MusicXML) for a version. Same access
    gate as the manifest route; 404s cleanly when this version has no
    music file (PDF-only)."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)
    if version.file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no music file")
    return FileResponse(_source_path_or_404(version.file_path, "This version's music file"))


@router.get("/versions/{version_id}/pdf")
def get_version_pdf(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Raw PDF bytes for a version. Same access gate as the manifest route;
    404s cleanly when this version has no PDF."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)
    if version.pdf_file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no PDF")
    return FileResponse(_source_path_or_404(version.pdf_file_path, "This version's PDF"))


@router.get("/versions/{version_id}/manifest", response_model=RenderManifestOut)
def get_version_manifest(
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RenderManifestOut:
    """B7: stems + MusicXML + tempo metadata for this version, rendering
    (and caching) it on first request. Authenticated-member access only for
    now — B6's guest join-code path will call `render_manifest`/
    `render_file_path` directly, scoped to that group's actual
    distributions, once it exists."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)

    if not is_midi_file(version.file_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This version's file isn't a MIDI file")

    source_path = _source_path_or_404(version.file_path, "This version's music file")
    try:
        manifest = render_manifest(version_id, source_path)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    base = f"/library/versions/{version_id}/renders"
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


@router.get("/versions/{version_id}/renders/{filename}")
def get_version_render_file(
    filename: str,
    version_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> FileResponse:
    """Serves one file (a stem WAV or the MusicXML) named by the manifest
    above. Same access gate as the manifest endpoint."""
    version = _get_version_or_404(version_id, db)
    piece = _get_piece_or_404(version.piece_id, db)
    _require_piece_access(piece, current_user, db)

    try:
        path = render_file_path(version_id, filename)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path)
