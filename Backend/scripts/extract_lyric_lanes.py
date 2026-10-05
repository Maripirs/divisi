"""Save PDF lyric-lane evidence for human review before classification."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from app.lyrics.staff_pdf import extract_lyric_systems


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--staves-per-system", type=int, default=4)
    parser.add_argument("--ocr-jsonl", type=Path)
    parser.add_argument("--staff-overrides", type=Path, help="Reviewed page-to-staff-box JSON for incomplete raster detection")
    parser.add_argument("--system-map", type=Path, help="Reviewed page-to-voice-staff mapping for changing layouts")
    parser.add_argument("--lyric-gap-min", type=float, default=4)
    parser.add_argument("--lyric-gap-max", type=float, default=21)
    args = parser.parse_args()
    pages = extract_lyric_systems(
        args.pdf, staves_per_system=args.staves_per_system, ocr_jsonl=args.ocr_jsonl,
        staff_overrides=json.loads(args.staff_overrides.read_text()) if args.staff_overrides else None,
        system_map=json.loads(args.system_map.read_text()) if args.system_map else None,
        lyric_gap_min=args.lyric_gap_min, lyric_gap_max=args.lyric_gap_max,
    )
    artifact = {
        "pdf_sha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
        "pages": pages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, ensure_ascii=False, indent=2) + "\n")
    print(f"{len(pages)} pages; {sum(len(p['systems']) for p in pages)} systems; "
          f"{sum('warning' in p for p in pages)} pages need manual staff review")
