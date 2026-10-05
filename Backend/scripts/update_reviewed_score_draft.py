"""Replace an unpublished SFCC draft's MusicXML with a checked candidate.

Requires the draft ID and its original file hash in the manifest. The
distributed version stays untouched. Rerunning an applied update is safe.
The previous object is retained for recovery and named in the local report.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.storage.files import delete_file, load_file, save_file


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def update(manifest_path: Path, candidate_path: Path, *, check_only: bool = False) -> dict:
    if not get_settings().object_storage_enabled:
        raise ValueError("Object storage must be configured")
    manifest = json.loads(manifest_path.read_text())
    candidate = candidate_path.read_bytes()
    report = json.loads(candidate_path.with_suffix(candidate_path.suffix + ".report.json").read_text())
    if report["musicxml_sha256"] != digest(candidate):
        raise ValueError("Candidate differs from its verification report")
    if report["source_pdf_sha256"] != manifest["source_pdf_sha256"]:
        raise ValueError("Candidate refers to another PDF")
    if digest((manifest_path.parent / Path(manifest["source_musicxml"]).name).read_bytes()) != manifest["source_musicxml_sha256"]:
        raise ValueError("Corrected source file changed")

    stored_path = None
    old_path = None
    try:
        with engine.begin() as connection:
            piece = connection.execute(
                text("SELECT id,title,owner_id,owner_type FROM pieces WHERE id=:id FOR UPDATE"),
                {"id": manifest["piece_id"]},
            ).mappings().first()
            if not piece or piece["title"] != manifest["piece"] or piece["owner_type"] != "group":
                raise ValueError("SFCC piece identity changed")
            admin = connection.execute(
                text("SELECT 1 FROM group_memberships WHERE group_id=:g AND user_id=:u AND role='admin' LIMIT 1"),
                {"g": piece["owner_id"], "u": manifest["created_by"]},
            ).first()
            if not admin:
                raise ValueError("Draft creator is no longer an SFCC admin")
            live = connection.execute(
                text("""SELECT pv.id,pv.file_path,pv.pdf_file_path FROM piece_versions pv
                        JOIN distributions d ON d.piece_version_id=pv.id
                        WHERE pv.piece_id=:p AND d.group_id=:g
                        ORDER BY d.distributed_at DESC LIMIT 1"""),
                {"p": piece["id"], "g": piece["owner_id"]},
            ).mappings().first()
            if not live or live["id"] != manifest["live_version_id"] or live["pdf_file_path"] != manifest["source_pdf_storage_key"]:
                raise ValueError("Distributed score changed")
            if live["file_path"] != manifest["source_musicxml_storage_key"]:
                raise ValueError("Distributed MusicXML changed")
            if digest(load_file(live["file_path"])) != manifest["original_source_musicxml_sha256"]:
                raise ValueError("Distributed MusicXML bytes changed")
            if digest(load_file(live["pdf_file_path"])) != manifest["source_pdf_sha256"]:
                raise ValueError("Distributed PDF bytes changed")
            draft = connection.execute(
                text("""SELECT id,status,source,file_path,pdf_file_path,created_by
                        FROM piece_versions WHERE id=:id AND piece_id=:piece_id FOR UPDATE"""),
                {"id": manifest["review_draft_id"], "piece_id": piece["id"]},
            ).mappings().first()
            if not draft or draft["status"] != "draft" or draft["source"] != "modification":
                raise ValueError("Expected unpublished review draft is unavailable")
            if draft["created_by"] != manifest["created_by"] or draft["pdf_file_path"] != manifest["source_pdf_storage_key"]:
                raise ValueError("Review draft identity changed")
            existing = load_file(draft["file_path"])
            if digest(existing) == digest(candidate):
                return {"draft_id": draft["id"], "status": "already_updated", "musicxml_sha256": digest(candidate)}
            if digest(existing) != manifest["review_draft_musicxml_sha256"]:
                raise ValueError("Review draft file changed since lyric review")
            if check_only:
                return {"draft_id": draft["id"], "status": "ready", "musicxml_sha256": digest(candidate)}
            old_path = draft["file_path"]
            stored_path = save_file(candidate, suffix=".musicxml")
            connection.execute(
                text("UPDATE piece_versions SET file_path=:path,file_name=:name WHERE id=:id"),
                {"path": stored_path, "name": "ezekiel-lyrics-and-measures.musicxml", "id": draft["id"]},
            )
    except Exception:
        if stored_path:
            delete_file(stored_path)
        raise
    if digest(load_file(stored_path)) != digest(candidate):
        raise ValueError("Stored draft bytes failed verification")
    update_report = {"draft_id": manifest["review_draft_id"], "status": "updated",
                     "musicxml_sha256": digest(candidate), "previous_storage_key": old_path,
                     "new_storage_key": stored_path}
    candidate_path.with_suffix(candidate_path.suffix + ".draft.json").write_text(json.dumps(update_report, indent=2) + "\n")
    return update_report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(update(args.manifest, args.candidate, check_only=args.check_only), indent=2))
