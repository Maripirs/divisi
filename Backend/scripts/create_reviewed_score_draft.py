"""Attach a checked MusicXML correction as an unpublished SFCC review draft.

This uses only the piece_versions columns present in the deployed database.
It leaves the distributed version untouched and refuses to replace another draft.
Run from Backend with a manifest and its checked candidate MusicXML file.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree as ET

from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine
from app.storage.files import delete_file, load_file, save_file


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def create_draft(manifest_path: Path, candidate_path: Path, *, check_only: bool = False) -> dict:
    if not get_settings().object_storage_enabled:
        raise ValueError("Object storage must be configured")
    manifest = json.loads(manifest_path.read_text())
    candidate = candidate_path.read_bytes()
    report = json.loads(candidate_path.with_suffix(candidate_path.suffix + ".report.json").read_text())
    if report["musicxml_sha256"] != digest(candidate):
        raise ValueError("Candidate differs from its verification report")
    for field in ("source_musicxml_sha256", "source_pdf_sha256"):
        if report[field] != manifest[field]:
            raise ValueError(f"Candidate report differs from manifest: {field}")
    if report.get("complete_review") is False:
        raise ValueError("Candidate still has unreviewed lyric lanes")
    candidate_root = ET.fromstring(candidate)
    lyric_count = sum(bool((lyric.findtext("text") or "").strip()) for lyric in candidate_root.iter("lyric"))
    if "total_lyrics" in report and lyric_count != report["total_lyrics"]:
        raise ValueError("Candidate lyric count differs from its verification report")
    has_lyrics = lyric_count > 0
    draft_kind = manifest.get("draft_kind")
    if draft_kind not in (None, "lyrics_generation"):
        raise ValueError("Unsupported review draft kind")
    if draft_kind == "lyrics_generation" and not has_lyrics:
        raise ValueError("Lyrics draft has no lyric text")
    suffix = manifest.get("draft_suffix", "score-correction")
    if not re.fullmatch(r"[a-z0-9-]+", suffix):
        raise ValueError("Invalid draft filename suffix")

    stored_path = None
    try:
        with engine.begin() as connection:
            piece = connection.execute(
                text("SELECT id, title, owner_type, owner_id FROM pieces WHERE id=:id FOR UPDATE"),
                {"id": manifest["piece_id"]},
            ).mappings().first()
            if not piece or piece["title"] != manifest["piece"] or piece["owner_type"] != "group":
                raise ValueError("SFCC piece identity changed")
            admin = connection.execute(
                text("""SELECT 1 FROM group_memberships WHERE group_id=:group_id
                        AND user_id=:user_id AND role='admin' LIMIT 1"""),
                {"group_id": piece["owner_id"], "user_id": manifest["created_by"]},
            ).first()
            if not admin:
                raise ValueError("Draft creator is no longer an SFCC admin")
            live = connection.execute(
                text("""SELECT pv.id, pv.file_path, pv.pdf_file_path, pv.file_name, pv.pdf_file_name
                        FROM piece_versions pv JOIN distributions d ON d.piece_version_id=pv.id
                        WHERE pv.piece_id=:piece_id AND d.group_id=:group_id
                        ORDER BY d.distributed_at DESC LIMIT 1"""),
                {"piece_id": piece["id"], "group_id": piece["owner_id"]},
            ).mappings().first()
            if not live or live["id"] != manifest["live_version_id"]:
                raise ValueError("Distributed version changed after score review")
            if live["file_path"] != manifest["source_musicxml_storage_key"]:
                raise ValueError("Distributed MusicXML path changed")
            if live["pdf_file_path"] != manifest["source_pdf_storage_key"]:
                raise ValueError("Distributed PDF path changed")
            live_source_hash = manifest.get("original_source_musicxml_sha256", manifest["source_musicxml_sha256"])
            if digest(load_file(live["file_path"])) != live_source_hash:
                raise ValueError("Distributed MusicXML bytes changed")
            if digest(load_file(live["pdf_file_path"])) != manifest["source_pdf_sha256"]:
                raise ValueError("Distributed PDF bytes changed")

            existing = connection.execute(
                text("""SELECT id, file_path, has_lyrics, draft_kind FROM piece_versions WHERE piece_id=:piece_id
                        AND status='draft' ORDER BY created_at DESC"""),
                {"piece_id": piece["id"]},
            ).mappings().all()
            if existing:
                if len(existing) == 1 and existing[0]["file_path"] and digest(load_file(existing[0]["file_path"])) == digest(candidate):
                    draft = existing[0]
                    if draft["has_lyrics"] != has_lyrics or draft["draft_kind"] != draft_kind:
                        if check_only:
                            return {"draft_id": draft["id"], "status": "metadata_update_ready",
                                    "has_lyrics": has_lyrics, "draft_kind": draft_kind}
                        connection.execute(
                            text("""UPDATE piece_versions SET has_lyrics=:has_lyrics,
                                    draft_kind=:draft_kind WHERE id=:id"""),
                            {"has_lyrics": has_lyrics, "draft_kind": draft_kind, "id": draft["id"]},
                        )
                        return {"draft_id": draft["id"], "status": "metadata_updated",
                                "has_lyrics": has_lyrics, "draft_kind": draft_kind}
                    return {"draft_id": draft["id"], "status": "already_exists"}
                raise ValueError(f"Piece has another review draft: {existing[0]['id']}")
            if check_only:
                return {"status": "ready", "candidate_sha256": digest(candidate)}

            stored_path = save_file(candidate, suffix=".musicxml")
            draft_id = str(uuid4())
            filename = f"{Path(live['file_name'] or piece['title']).stem}-{suffix}.musicxml"
            connection.execute(
                text("""INSERT INTO piece_versions
                        (id, piece_id, created_by, created_at, source, status,
                         file_path, pdf_file_path, file_name, pdf_file_name,
                         has_lyrics, draft_kind)
                        VALUES (:id, :piece_id, :created_by, :created_at, 'modification',
                                'draft', :file_path, :pdf_file_path, :file_name, :pdf_file_name,
                                :has_lyrics, :draft_kind)"""),
                {
                    "id": draft_id,
                    "piece_id": piece["id"],
                    "created_by": manifest["created_by"],
                    "created_at": datetime.now(timezone.utc),
                    "file_path": stored_path,
                    "pdf_file_path": live["pdf_file_path"],
                    "file_name": filename,
                    "pdf_file_name": live["pdf_file_name"],
                    "has_lyrics": has_lyrics,
                    "draft_kind": draft_kind,
                },
            )
    except Exception:
        if stored_path:
            delete_file(stored_path)
        raise
    if digest(load_file(stored_path)) != digest(candidate):
        raise ValueError("Stored draft bytes failed verification")
    return {"draft_id": draft_id, "status": "created", "candidate_sha256": digest(candidate)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("--check-only", action="store_true")
    args = parser.parse_args()
    print(json.dumps(create_draft(args.manifest, args.candidate, check_only=args.check_only), indent=2))
