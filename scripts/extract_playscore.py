#!/usr/bin/env python3
"""Extract usable files from a PlayScore .playscore package.

PlayScore packages are ZIP files that commonly contain:
  - doc.xml: MusicXML
  - doc.mid: MIDI
  - doc.json: PlayScore metadata
  - one PDF file
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
from pathlib import Path


def safe_stem(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    cleaned = cleaned.strip("._-")
    return cleaned or "playscore_export"


def package_title(package: zipfile.ZipFile, fallback: str) -> str:
    try:
        metadata = json.loads(package.read("doc.json").decode("utf-8"))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError):
        return fallback

    title = metadata.get("metadata", {}).get("work_title")
    return title if isinstance(title, str) and title.strip() else fallback


def write_member(
    package: zipfile.ZipFile,
    member_name: str,
    destination: Path,
    required: bool = False,
) -> Path | None:
    if member_name not in package.namelist():
        if required:
            raise SystemExit(f"Missing required package member: {member_name}")
        return None

    destination.write_bytes(package.read(member_name))
    return destination


def extract_playscore(source: Path, output_dir: Path) -> list[Path]:
    if not source.exists():
        raise SystemExit(f"File does not exist: {source}")

    if not zipfile.is_zipfile(source):
        raise SystemExit(f"Not a ZIP-based PlayScore package: {source}")

    output_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(source) as package:
        stem = safe_stem(package_title(package, source.stem))
        written = [
            write_member(package, "doc.xml", output_dir / f"{stem}.musicxml", required=True),
            write_member(package, "doc.mid", output_dir / f"{stem}.mid", required=True),
            write_member(package, "doc.json", output_dir / f"{stem}.playscore.json"),
        ]

        for member_name in package.namelist():
            if member_name.lower().endswith(".pdf"):
                written.append(write_member(package, member_name, output_dir / f"{stem}.pdf"))
                break

    return [path for path in written if path is not None]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract MusicXML, MIDI, metadata, and PDF from a .playscore file."
    )
    parser.add_argument("playscore", type=Path, help="Path to the .playscore file")
    parser.add_argument(
        "-o",
        "--output-dir",
        type=Path,
        help="Directory for extracted files. Defaults to the .playscore file's folder.",
    )
    args = parser.parse_args()

    output_dir = args.output_dir or args.playscore.parent
    written = extract_playscore(args.playscore, output_dir)

    print("Extracted:")
    for path in written:
        print(path)


if __name__ == "__main__":
    main()
