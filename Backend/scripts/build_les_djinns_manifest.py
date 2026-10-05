"""Save PDF-reviewed Les djinns lyric lines by printed score system."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1]
MUSIC = BACKEND / "data/storage/_object_cache/8819964ffa9744cd9e97b54b0eb30ebb.musicxml"
PDF = BACKEND / "data/storage/_object_cache/7afe0cf1954d4d21aa2c33bfa58fa376.pdf"
OUT = BACKEND / "lyric_runs/sfcc/les_djinns.review_text.json"
FINAL = BACKEND / "lyric_runs/sfcc/les_djinns.json"
VOICES = ("soprano", "alto", "tenor", "bass")


def all_four(words: str) -> tuple[str, str, str, str]:
    return (words,) * 4


# Each row is one printed system: page, first and last measure, then SATB.
# A pipe separates syllables printed under separate notes.
ROWS = [
    (1, 1, 6, "", "Murs, ville et port, a|sile de mort,", "", ""),
    (1, 7, 11, "dans la plaine", "mer grise où brise la brise, tout dort, dans la", "", ""),
    (2, 12, 14, "naît un bruit C'est l'ha|lei|ne de la nuit", "plai|ne naît un bruit C'est l'ha|lei|ne de la nuit", "", ""),
    (2, 15, 18, "el|le brâ|me, com|me u|ne â|me Qu'une flam|me tou|jours suit", "el|le brâ|me, com|me u|ne â|me Qu'une flamme tou|jours suit", "", ""),
    (3, 19, 21, "La voix plus hau|te semble un gre|lot, d'un nain qui", "La voix plus hau|te semble un gre|lot, d'un nain qui", "La voix plus hau|te semble un gre|lot, d'un nain qui sau|te", ""),
    (3, 22, 24, "sau|te c'est le ga|lop, Il fuit, s'é|lan|ce, puis, en ca|", "sau|te c'est le ga|lop, Il fuit, s'é|lan|ce, puis, en ca|", "c'est le ga|lop, Il fuit, s'é|lan|ce, puis, en ca|den|ce,", ""),
    (4, 25, 27, "|den|ce sur un pied danse au bout d'un flot.", "|den|ce sur un pied danse au bout d'un flot. L'é|", "Sur un pied dan|se au bout d'un flot,", "La ru|meur ap|pro|che"),
    (4, 28, 29, "C'est com|me la clo|che", "|cho la re|dit C'est com|me la clo|che", "C'est com|me la clo|che", "C'est com|me la clo|che"),
    (5, 30, 32, "d'un cou|vent mau|dit", "d'un cou|vent mau|dit qui tonne et qui rou|le", "d'un cou|vent mau|dit", "d'un cou|vent mau|dit comme un bruit de fou|le"),
    (5, 33, 35, *all_four("qui tan|tôt s'é|crou|le et tan|tôt gran|dit Dieu! La")),
    (6, 36, 38, *all_four("voix sé|pul|cra|le des djinns! Quel bruit ils font, Fuy|")),
    (6, 39, 41, *all_four("|ons sous la spi|ra|le de l'es|ca|lier pro|")),
    (7, 42, 44, *all_four("|fond dé|jà s'é|teint ma lam|pe")),
    (7, 45, 47, *all_four("et l'om|bre de la ram|pe qui le long du mur ram|pe,")),
    (8, 48, 50, *all_four("mon|te jus|qu'au pla|fond!")),
    (8, 51, 52, *all_four("Cris de l'enfer! voix qui hur|le et qui pleu|re,")),
    (9, 53, 54, *all_four("L'hor|rible es|saim pous|sé par l'a|qui|lon sans")),
    (9, 55, 57, *all_four("dou|te, ô ciel s'a|bat sur ma de|meure, le mur flé|chit sous le")),
    (10, 58, 60, *all_four("noir ba|tail|lon, La mai|son crie et chan|cel|le, pen|ché|e,")),
    (10, 61, 62, *all_four("et l'on di|rait que du sol ar|ra|ché|e")),
    (11, 63, 64, *all_four("Ain|si qu'il chasse u|ne feuil|le sé|ché|e")),
    (11, 65, 67, "le vent la roule a|vec leur tour|bil|lon", "le vent la roule a|vec leur tour|bil|lon", "le vent la roule a|vec leur tour|bil|lon Pro|phè|te, si ta main me", "le vent la roule a|vec leur tour|bil|lon Pro|phè|te, si ta main me"),
    (12, 68, 70, "", "", "sau|ve de ces ob|scurs dé|mons des soirs J'i|", "sau|ve de ces ob|scurs dé|mons des soirs J'i|"),
    (12, 71, 73, "", "", "|rai pros|ter|ner mon front chau|ve de|vant tes sa|crés en|cen|", "|rai pros|ter|ner mon front chau|ve de|vant tes sa|crés en|cen|"),
    (13, 74, 75, "Fais que sur ces por|tes fi|", "Fais que sur ces por|tes fi|", "|soirs! Fais que sur ces por|tes fi|", "|soirs! Fais que sur ces por|tes fi|"),
    (13, 76, 77, *all_four("|dè|les Meu|re leur souf|fle d'é|tin|")),
    (14, 78, 79, *all_four("|cel|les Et qu'en vain l'on|gle de leurs")),
    (14, 80, 81, "ai|les grin|ce et crie. sur ces vi|traux", "ai|les grin|ce et crie. sur ces vi|traux", "ai|les grince et crie. sur ces vi|traux", "ai|les grin|ce et crie. sur ces vi|traux"),
    (15, 82, 84, *all_four("noirs!")),
    (15, 85, 86, *all_four("De leurs ai|les loin|tai|nes")),
    (16, 87, 89, *all_four("Le bat|te|ment dé|croit Si con|fus dans les")),
    (16, 90, 92, *all_four("plai|nes, Si fai|ble que l'on croit ou|ir la sau|te|")),
    (17, 93, 94, *all_four("|rel|le cri|er d'u|ne voix grê|le ou pé|til|ler la")),
    (17, 95, 97, *all_four("grê|le Sur le plomb d'un vieux toit.")),
    (18, 98, 100, "Les djinns fu|nè|bres fils du tré|", "Les djinns fu|nè|bres fils du tré|", "Les djinns fu|nè|bres fils du tré|pas.", ""),
    (18, 101, 102, "|pas dans les té|nè|bres pres|sent leurs", "|pas dans les té|nè|bres pres|sent leurs", "dans les té|nè|bres pres|sent leurs pas", ""),
    (19, 103, 104, "pas Leur es|saim gron|de Ain|si, pro|", "pas Leur es|saim gron|de Ain|si, pro|", "Leur es|saim gron|de Ain|si, pro|fon|de,", ""),
    (19, 105, 106, "|fon|de, mur|mure une on|de qu'on ne voit pas.", "|fon|de, mur|mure une on|de qu'on ne voit pas.", "mur|mure une on|de qu'on ne voit pas.", ""),
    (20, 107, 109, "Ce bruit va|gue Qui s'en|dort C'est la va|gue", "Ce bruit va|gue Qui s'en|dort C'est la", "", ""),
    (20, 110, 112, "Sur le bord, C'est la plain|te Pres|que é|tein|te", "va|gue Sur le bord, C'est la plain|te Presque é|tein|te", "", ""),
    (21, 113, 117, "D'u|ne sain|te pour un mort.", "D'u|ne sain|te pour un mort. On dou|te, la nuit, j'é|cou|te", "", ""),
    (21, 118, 124, "", "Tout fuit, Tout pas|se, l'es|pa|ce ef|fa|ce le bruit.", "", ""),
]

# The PDF prints one syllable across these repeated noteheads. Indices are
# zero-based within the selected onsets of the named printed measure.
EXCLUDE = {
    (1, 1, "alto"): ((3, 2), (5, 2)),
    (1, 2, "soprano"): ((11, 3),),
    (1, 2, "alto"): ((7, 2), (8, 2), (9, 2)),
    (14, 1, "soprano"): ((79, 2),),
}


def syllables(line: str) -> list[dict[str, str]]:
    result = []
    for word in line.split():
        leading, trailing = word.startswith("|"), word.endswith("|")
        parts = [part for part in word.split("|") if part]
        if not parts:
            raise ValueError(f"Empty sung word: {word!r}")
        for index, text in enumerate(parts):
            if leading and trailing:
                kind = "middle"
            elif leading:
                kind = "end" if index == len(parts) - 1 else "middle"
            elif trailing:
                kind = "begin" if index == 0 else "middle"
            elif len(parts) == 1:
                kind = "single"
            else:
                kind = "begin" if index == 0 else "end" if index == len(parts) - 1 else "middle"
            result.append({"text": text, "syllabic": kind})
    return result


def build() -> dict:
    if len(ROWS) != 42:
        raise ValueError("Expected 42 printed systems")
    segments = []
    for i, (page, first, last, *words) in enumerate(ROWS):
        system = 1 if i % 2 == 0 else 2
        if page != i // 2 + 1:
            raise ValueError("Printed page order changed")
        segments.append({"page": page, "system": system, "measure_start": first,
                         "measure_end": last, "words": dict(zip(VOICES, words))})
    if [(a["measure_end"] + 1, b["measure_start"]) for a, b in zip(segments, segments[1:]) if a["measure_end"] + 1 != b["measure_start"]]:
        raise ValueError("Printed measure map has a gap")
    return {
        "piece": "Les djinns, Op. 12", "piece_id": "8ac8f218-f0c8-495d-b8e8-73646289b851",
        "live_version_id": "6379e5bf-ac0c-41d2-b7fb-424eb8c2f65c",
        "source_musicxml": str(MUSIC.relative_to(BACKEND)), "source_pdf": str(PDF.relative_to(BACKEND)),
        "source_musicxml_storage_key": "obj/8819964ffa9744cd9e97b54b0eb30ebb.musicxml",
        "source_pdf_storage_key": "obj/7afe0cf1954d4d21aa2c33bfa58fa376.pdf",
        "source_musicxml_sha256": hashlib.sha256(MUSIC.read_bytes()).hexdigest(),
        "source_pdf_sha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
        "created_by": "7f8d0b13-6ddb-406e-b391-8921b88552b4",
        "draft_suffix": "lyrics", "draft_kind": "lyrics_generation", "segments": segments,
    }


def alignment_manifest(review: dict) -> dict:
    from music21 import converter

    from app.lyrics.aligned import select_lyric_onsets
    from app.lyrics.inject import _match_parts_to_voices

    score = converter.parse(str(MUSIC))
    parts = _match_parts_to_voices(score)
    segments = []
    for row in review["segments"]:
        page, system = row["page"], row["system"]
        start, end = row["measure_start"], row["measure_end"]
        voices = []
        for voice, words in row["words"].items():
            chosen = list(select_lyric_onsets(parts[voice], start, end))
            excluded = set()
            for number, index in EXCLUDE.get((page, system, voice), ()):
                per_measure = [onset for onset in chosen if onset.measure == number]
                if index >= len(per_measure):
                    raise ValueError(f"Missing reviewed note {page}:{system}:{voice} m{number} #{index}")
                excluded.add(round(float(per_measure[index].offset), 6))
            syllable_rows = syllables(words)
            kept = [round(float(onset.offset), 6) for onset in chosen
                    if round(float(onset.offset), 6) not in excluded]
            if len(syllable_rows) != len(kept):
                raise ValueError(f"Page {page} system {system} {voice}: {len(syllable_rows)} syllables for {len(kept)} notes")
            entry = {"voice": voice, "syllables": syllable_rows}
            if excluded:
                entry["onset_offsets"] = kept
            voices.append(entry)
        segments.append({"page": page, "system": system, "measure_start": start,
                         "measure_end": end, "voices": voices})
    return {key: value for key, value in review.items() if key != "segments"} | {
        "segments": segments, "preserve_source_part_indices": [4, 5],
    }


if __name__ == "__main__":
    review = build()
    OUT.write_text(json.dumps(review, indent=2, ensure_ascii=False) + "\n")
    final = alignment_manifest(review)
    FINAL.write_text(json.dumps(final, indent=2, ensure_ascii=False) + "\n")
    print(f"Saved {len(ROWS)} score systems to {FINAL}")
