"""Rebuild Ezekiel's PDF-reviewed SATB lyric manifest from saved evidence.

The page text layer provides most lines. The override file records readings
checked against page images where extraction merged staves or music markings.
Explicit onset choices resolve printed slurs and the two-voice alto refrain.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from music21 import converter

from app.lyrics.aligned import select_lyric_onsets, select_voice_onsets
from app.lyrics.inject import _match_parts_to_voices

ROOT = Path(__file__).resolve().parents[1]
STEM = "ezekiel_saw_de_wheel"
RUN = ROOT / "lyric_runs" / "sfcc"
VOICES = ("soprano", "alto", "tenor", "bass")


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _base_tokens(bounds: list[dict], lanes: dict, overrides: dict) -> dict:
    found = set()
    rows = {}
    for bound in bounds:
        page, system = bound["page"], bound["system"]
        printed = next(
            (s for p in lanes["pages"] if p["page"] == page
             for s in p["systems"] if s["index"] == system), None
        )
        if printed is None:
            raise ValueError(f"Missing PDF text at page {page} system {system}")
        for voice in VOICES:
            key = f"{page}:{system}:{voice}"
            line = overrides.get(key, printed["voices"].get(voice, ""))
            if key in overrides:
                found.add(key)
            rows[key] = line.split()
    if found != set(overrides):
        raise ValueError(f"Unused visual overrides: {set(overrides) - found}")
    return rows


def _syllabics(bounds: list[dict], rows: dict) -> dict:
    """Recover word joins from text-layer syllables, including page breaks."""
    result = {key: [{"text": token, "syllabic": "single"} for token in tokens]
              for key, tokens in rows.items()}
    for voice in VOICES:
        sequence = []
        for bound in bounds:
            key = f"{bound['page']}:{bound['system']}:{voice}"
            sequence += [(key, i, token) for i, token in enumerate(rows[key])]
        simple = [re.sub(r"[^a-z]", "", token.lower()) for _, _, token in sequence]
        index = 0
        while index < len(sequence):
            patterns = [("doom", "a", "loom", "a"), ("hal", "le", "lu", "jah"),
                        ("hal", "le", "lu"), ("e", "ze", "kul"),
                        ("mid", "dle"), ("lit", "tle"), ("be", "fore")]
            if int(sequence[index][0].split(":")[0]) >= 10 and voice in {"alto", "bass"}:
                patterns.append(("in", "a"))
            match = next((p for p in patterns if tuple(simple[index:index + len(p)]) == p), None)
            if match:
                for j in range(len(match)):
                    key, token_index, _ = sequence[index + j]
                    result[key][token_index]["syllabic"] = (
                        "begin" if j == 0 else "end" if j == len(match) - 1 else "middle"
                    )
                index += len(match)
            else:
                index += 1
    return result


def _supplementary_lines(parts: dict) -> list[dict]:
    """Written second lyric rows on existing soprano, alto, and bass voices."""
    from music21 import stream

    def targets(part, voice_id: str, measures: range, local_offsets: tuple[float, ...]):
        chosen = []
        for number in measures:
            measure = next(m for m in part.getElementsByClass(stream.Measure) if m.number == number)
            voices = [v for v in measure.voices if str(v.id) == voice_id]
            if len(voices) != 1:
                raise ValueError(f"Missing written voice {voice_id} in measure {number}")
            for at in local_offsets:
                matches = [n for n in voices[0].recurse().notes if round(float(n.offset), 6) == at]
                if len(matches) != 1 or len(matches[0].pitches) != 1:
                    raise ValueError(f"Expected one note in measure {number} at {at}")
                chosen.append({"offset": round(float(matches[0].getOffsetInHierarchy(part)), 6),
                               "pitch": matches[0].pitches[0].nameWithOctave})
        return chosen

    return [
        {"voice": "alto", "measure_start": 73, "measure_end": 86,
         "onset_targets": targets(parts["alto"], "17", range(73, 87), (0.5, 1.5, 1.75)),
         "syllables": [s for _ in range(14) for s in (
             {"text": "wheel", "syllabic": "single"},
             {"text": "in", "syllabic": "begin"},
             {"text": "a,", "syllabic": "end"})]},
        {"voice": "bass", "measure_start": 73, "measure_end": 86,
         "onset_targets": targets(parts["bass"], "10", range(73, 87), (0.0, 1.0)),
         "syllables": [{"text": "wheel,", "syllabic": "single"} for _ in range(28)]},
        {"voice": "soprano", "measure_start": 90, "measure_end": 90,
         "onset_targets": targets(parts["soprano"], "21", range(90, 91), (0.0,)),
         "syllables": [{"text": "air.", "syllabic": "single"}]},
    ]


def build() -> dict:
    number_manifest = json.loads((RUN / f"{STEM}.measure_numbers.json").read_text())
    bounds = json.loads((RUN / f"{STEM}.system_bounds.json").read_text())
    lanes = json.loads((RUN / f"{STEM}.text_lanes.json").read_text())
    overrides = json.loads((RUN / f"{STEM}.lyric_overrides.json").read_text())
    source = RUN / f"{STEM}.measures.musicxml"
    pdf = ROOT / "data/storage/_object_cache/57f7106208b74a2ba808f8a7ebefe091.pdf"
    if _digest(source) != json.loads(source.with_suffix(source.suffix + ".report.json").read_text())["musicxml_sha256"]:
        raise ValueError("Corrected measure source changed")
    if _digest(pdf) != number_manifest["source_pdf_sha256"] or lanes["pdf_sha256"] != _digest(pdf):
        raise ValueError("PDF evidence changed")
    tokens = _base_tokens(bounds, lanes, overrides)
    syllables = _syllabics(bounds, tokens)
    score = converter.parse(str(source))
    parts = _match_parts_to_voices(score)
    segments = []
    errors = []
    for bound in bounds:
        page, system = bound["page"], bound["system"]
        start, end = bound["measure_start"], bound["measure_end"]
        voices = []
        for voice in VOICES:
            key = f"{page}:{system}:{voice}"
            entry = {"voice": voice, "syllables": syllables[key]}
            part = parts[voice]
            default = select_lyric_onsets(part, start, end)
            if key in {"4:2:soprano", "4:2:alto"}:
                entry["onset_offsets"] = sorted({round(x.offset, 6) for x in default} | {54.5, 55.0})
                count = len(entry["onset_offsets"])
            elif key == "5:2:soprano":
                entry["onset_offsets"] = [68.5, 69.0, 69.25, 69.5, 69.75,
                                           70.0, 70.25, 70.5, 72.5]
                count = len(entry["onset_offsets"])
            elif key == "15:1:soprano":
                entry["onset_targets"] = [
                    {"offset": at, "pitch": pitch}
                    for at, pitch in [(178.5, "F5"), (178.75, "F5"),
                                      (179.5, "F5"), (180.0, "F5"),
                                      (180.5, "G-5"), (181.5, "G-5"),
                                      (182.5, "G-5"), (183.5, "G-5"),
                                      (184.5, "G5")]
                ]
                count = len(entry["onset_targets"])
            elif voice == "alto" and 10 <= page <= 13:
                entry["source_voice_id"] = "18"
                count = len(select_voice_onsets(part, start, end, "18"))
            elif key == "14:1:alto":
                entry["source_voice_id"] = "18"
                entry["source_voice_until_measure"] = 86
                count = len(select_voice_onsets(part, start, 86, "18")) + len(select_lyric_onsets(part, 87, end))
            else:
                count = len(default)
            if count != len(entry["syllables"]):
                errors.append(f"{key}: {len(entry['syllables'])} syllables, {count} onsets")
            voices.append(entry)
        segments.append({**bound, "voices": voices})
    if errors:
        raise ValueError("\n".join(errors))
    manifest = {
        "piece": number_manifest["piece"],
        "piece_id": number_manifest["piece_id"],
        "live_version_id": number_manifest["live_version_id"],
        "created_by": number_manifest["created_by"],
        "source_musicxml": str(source.relative_to(ROOT)),
        "source_musicxml_storage_key": number_manifest["source_musicxml_storage_key"],
        "original_source_musicxml_sha256": number_manifest["source_musicxml_sha256"],
        "source_musicxml_sha256": _digest(source),
        "source_pdf_sha256": _digest(pdf),
        "source_pdf_storage_key": number_manifest["source_pdf_storage_key"],
        "score_title": "Ezekiel Saw the Wheel",
        "composer": "William L. Dawson",
        "preserve_source_part_indices": [4],
        "draft_suffix": "lyrics-and-measures",
        "review_draft_id": "659b88e0-1443-449c-83d2-5fe0b3e25299",
        "review_draft_musicxml_sha256": _digest(source),
        "excluded_pdf_staves": ["solo", "4 altos", "2 first tenors and 2 baritones"],
        "segments": segments,
        "supplementary_lines": _supplementary_lines(parts),
    }
    output = RUN / f"{STEM}.lyrics.json"
    output.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return {"manifest": str(output), "systems": len(segments),
            "syllables_by_voice": {v: sum(len(x["syllables"]) for s in segments for x in s["voices"] if x["voice"] == v) for v in VOICES}}


if __name__ == "__main__":
    print(json.dumps(build(), indent=2))
