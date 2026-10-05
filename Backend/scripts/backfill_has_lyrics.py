"""One-off backfill for the `has_lyrics` column added by migration
30eef65c9760. That column only gets computed going forward (at upload /
generate-lyrics / AI-edit / OMR time) -- every `PieceVersion` row that
existed before the migration landed defaults to `has_lyrics=False`
regardless of what its MusicXML actually contains. Run once against
production to make existing approved/draft versions report correctly.

Usage: python scripts/backfill_has_lyrics.py [--dry-run]
"""

from __future__ import annotations

import sys

from app.db.session import SessionLocal
from app.db.models import PieceVersion
from app.lyrics.inject import has_any_lyrics
from app.storage.files import load_file

_MUSICXML_SUFFIXES = (".musicxml", ".xml", ".mxl")


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    db = SessionLocal()
    try:
        versions = (
            db.query(PieceVersion)
            .filter(PieceVersion.file_name.isnot(None))
            .filter(PieceVersion.has_lyrics.is_(False))
            .all()
        )
        changed = 0
        for version in versions:
            name = version.file_name or ""
            if "." not in name or "." + name.rsplit(".", 1)[-1].lower() not in _MUSICXML_SUFFIXES:
                continue
            try:
                data = load_file(version.file_path)
            except Exception as exc:  # noqa: BLE001
                print(f"  skip {version.id} ({name}): couldn't load file: {exc}")
                continue
            import tempfile

            from music21 import converter

            suffix = "." + name.rsplit(".", 1)[-1].lower()
            with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
                tmp.write(data)
                tmp.flush()
                try:
                    score = converter.parse(tmp.name)
                except Exception as exc:  # noqa: BLE001
                    print(f"  skip {version.id} ({name}): couldn't parse: {exc}")
                    continue
            if has_any_lyrics(score):
                changed += 1
                print(f"  has_lyrics=True: {version.id} piece={version.piece_id} ({name}, {version.status})")
                if not dry_run:
                    version.has_lyrics = True
        if not dry_run:
            db.commit()
        print(f"\n{'[dry run] would update' if dry_run else 'Updated'} {changed} of {len(versions)} checked versions.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
