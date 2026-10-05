"""Restore an approved lyric-bearing MusicXML to a PDF-only SFCC review draft.

The source version and current PDF must belong to the same piece and have
the hashes recorded in the manifest. The score object is reused, so this
command does not reclassify, re-encode, or duplicate the music file.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from app.db.models import GroupMembership, GroupRole, Piece, PieceVersion, VersionSource, VersionStatus
from app.db.session import SessionLocal
from app.services.pieces import add_version, live_version, working_draft
from app.storage.files import load_file


def restore(manifest_path: Path) -> str:
    manifest = json.loads(manifest_path.read_text())
    with SessionLocal() as db:
        piece = db.get(Piece, manifest["piece_id"])
        source = db.get(PieceVersion, manifest["source_version_id"])
        if piece is None or piece.title != manifest["piece"]:
            raise ValueError("Piece identity changed")
        if source is None or source.piece_id != piece.id or source.status != VersionStatus.approved:
            raise ValueError("Historical lyric source is no longer approved for this piece")
        live = live_version(piece, db)
        if live is None or live.id != manifest["live_version_id"] or live.file_path is not None:
            raise ValueError("Current live version is no longer the expected PDF-only score")
        pdf_bytes = load_file(live.pdf_file_path)
        if hashlib.sha256(pdf_bytes).hexdigest() != manifest["pdf_sha256"]:
            raise ValueError("Current PDF bytes differ from the reviewed source")
        if not source.pdf_file_path or load_file(source.pdf_file_path) != pdf_bytes:
            raise ValueError("Historical lyric score refers to a different PDF")
        musicxml = load_file(source.file_path)
        if hashlib.sha256(musicxml).hexdigest() != manifest["musicxml_sha256"] or b"<lyric" not in musicxml:
            raise ValueError("Historical MusicXML bytes or lyrics differ from the reviewed source")
        actor = source.created_by
        admin = (
            db.query(GroupMembership)
            .filter(
                GroupMembership.group_id == piece.owner_id,
                GroupMembership.user_id == actor,
                GroupMembership.role == GroupRole.admin,
            )
            .first()
        )
        if admin is None:
            raise ValueError("Historical score creator is not an SFCC admin")
        draft = working_draft(piece.id, db)
        if draft is not None:
            if draft.file_path == source.file_path and draft.pdf_file_path == live.pdf_file_path:
                return draft.id
            raise ValueError(f"Piece has a different working draft: {draft.id}")
        return add_version(
            piece=piece,
            created_by=actor,
            file_path=source.file_path,
            pdf_file_path=live.pdf_file_path,
            file_name=source.file_name,
            pdf_file_name=live.pdf_file_name,
            source=VersionSource.modification,
            db=db,
        ).id


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    print(restore(args.manifest))
