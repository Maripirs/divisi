"""Attach a checked SFCC lyric candidate as a reviewable production draft.

Run from Backend after apply_reviewed_lyrics.py. Existing drafts are kept;
rerunning this command with the same candidate reports the existing draft.
It never publishes a score or changes a live version.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import get_settings
from app.db.models import GroupMembership, GroupRole, Piece, User, VersionSource, VersionStatus
from app.db.session import SessionLocal
from app.services.pieces import add_version, live_version, working_draft
from app.storage.files import delete_file, load_file, save_file


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_draft(manifest_path: Path, candidate_path: Path, *, replace_draft: bool = False) -> str:
    if not get_settings().object_storage_enabled:
        raise ValueError("Production object storage must be configured before creating a draft")
    manifest = json.loads(manifest_path.read_text())
    candidate = candidate_path.read_bytes()
    report_path = candidate_path.with_suffix(candidate_path.suffix + ".report.json")
    report = json.loads(report_path.read_text())
    if report["musicxml_sha256"] != _digest(candidate):
        raise ValueError("Candidate differs from its verified alignment report")
    if report["source_pdf_sha256"] != manifest["source_pdf_sha256"]:
        raise ValueError("Candidate report refers to another PDF")

    with SessionLocal() as db:
        piece = db.get(Piece, manifest["piece_id"])
        if piece is None or piece.title != manifest["piece"]:
            raise ValueError("SFCC piece identity changed")
        live = live_version(piece, db)
        if live is None or live.id != manifest["live_version_id"]:
            raise ValueError("Live version changed after lyric review")
        if live.file_path != manifest["source_musicxml_storage_key"]:
            raise ValueError("Live MusicXML source changed")
        if _digest(load_file(live.file_path)) != manifest["source_musicxml_sha256"]:
            raise ValueError("Live MusicXML bytes changed")
        if live.pdf_file_path != manifest["source_pdf_storage_key"]:
            raise ValueError("Live PDF source changed")
        if _digest(load_file(live.pdf_file_path)) != manifest["source_pdf_sha256"]:
            raise ValueError("Live PDF bytes changed")
        actor = db.get(User, manifest["created_by"])
        if actor is None:
            raise ValueError("Draft creator is missing")
        admin = (
            db.query(GroupMembership)
            .filter(
                GroupMembership.group_id == piece.owner_id,
                GroupMembership.user_id == actor.id,
                GroupMembership.role == GroupRole.admin,
            )
            .first()
        )
        if admin is None:
            raise ValueError("Draft creator is not an SFCC admin")
        draft = working_draft(piece.id, db)
        if draft is not None:
            if draft.file_path and _digest(load_file(draft.file_path)) == _digest(candidate):
                return draft.id
            if not replace_draft:
                raise ValueError(f"Piece has a different working draft: {draft.id}")

        stored_path = save_file(candidate, suffix=".musicxml")
        try:
            if draft is not None:
                draft.status = VersionStatus.rejected
                draft.reviewed_by = actor.id
                draft.reviewed_at = datetime.now(timezone.utc)
                db.flush()
            suffix = manifest.get("draft_suffix", "lyrics")
            if not re.fullmatch(r"[a-z0-9-]+", suffix):
                raise ValueError("Invalid draft filename suffix")
            draft = add_version(
                piece=piece,
                created_by=actor.id,
                file_path=stored_path,
                pdf_file_path=live.pdf_file_path,
                file_name=f"{Path(live.file_name or piece.title).stem}-{suffix}.musicxml",
                pdf_file_name=live.pdf_file_name,
                source=VersionSource.modification,
                db=db,
            )
        except Exception:
            delete_file(stored_path)
            raise
        return draft.id


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--replace-draft", action="store_true", help="Reject an existing different draft before adding this one")
    args = parser.parse_args()
    print(create_draft(args.manifest, args.candidate, replace_draft=args.replace_draft))
