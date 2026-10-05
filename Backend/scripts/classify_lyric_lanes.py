"""Classify extracted SATB lyric lanes with Misaki, one PDF system at a time.

The output is a resumable proposal. Review the PDF and MusicXML before
copying syllables into an alignment manifest. A failed service call leaves
all completed systems saved, so rerunning resumes at the first gap.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

from app.lyrics.extract import PdfWordToken


def _tokens(page: int, voices: dict[str, str]) -> list[PdfWordToken]:
    tokens: list[PdfWordToken] = []
    for index, voice in enumerate(("soprano", "alto", "tenor", "bass")):
        y = index * 100.0
        tokens.append(PdfWordToken(voice.title(), 0, y, 0, y, page, 2 * index, 0))
        words = voices.get(voice, "").strip()
        if words:
            tokens.append(PdfWordToken(words, 0, y + 8, 0, y + 8, page, 2 * index + 1, 0))
    return tokens


def classify(lanes: Path, output: Path, model: str, *, pause_seconds: float = 2.0) -> dict:
    os.environ["MISAKI_LYRICS_MODEL"] = model
    from app.lyrics.groq_client import _classify_chunk_misaki

    evidence = json.loads(lanes.read_text())
    result = {"pdf_sha256": evidence["pdf_sha256"], "model": model, "systems": []}
    if output.exists():
        result = json.loads(output.read_text())
        if result["pdf_sha256"] != evidence["pdf_sha256"] or result["model"] != model:
            raise ValueError("Saved proposal belongs to a different PDF or model")
    completed = {(s["page"], s["system"]) for s in result["systems"]}
    for page in evidence["pages"]:
        for system in page["systems"]:
            key = (page["page"], system["index"])
            if key in completed:
                continue
            if not any(system["voices"].values()):
                continue
            voices, _response = _classify_chunk_misaki(_tokens(page["page"] - 1, system["voices"]))
            result["systems"].append({"page": key[0], "system": key[1], "voices": voices})
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
            time.sleep(pause_seconds)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lanes", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--model", required=True, help="Misaki model ID, e.g. deepseek-v4-flash")
    args = parser.parse_args()
    result = classify(args.lanes, args.output, args.model)
    print(f"Classified {len(result['systems'])} systems")
