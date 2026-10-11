"""Section tags on weekly notes and piece rehearsal notes ("this note is for
the tenors and basses"). Stored as one nullable string column,
`part_scope`, holding a canonical comma-separated list of voice parts in
SATB order (e.g. `"tenor,bass"`). `None` means the note is for everyone
("All"), and so does a selection of all four parts, which normalizes back
to `None` so there is exactly one spelling of "All".

Pure string logic, no ORM or request types, so the Frontend's mirror
(`Frontend/src/lib/notes/sections.ts`) can stay a line-for-line match."""

VOICE_PARTS: tuple[str, ...] = ("soprano", "alto", "tenor", "bass")


def normalize_part_scope(value: str | None) -> str | None:
    """Canonicalizes a write-side `part_scope`: trims and lowercases each
    token, drops empties, dedupes, and sorts into SATB order. Raises
    `ValueError` (a 422 from a pydantic validator) on any token that isn't a
    voice part, so a typo can't silently become an "All" note."""
    if value is None:
        return None
    tokens = {token.strip().lower() for token in value.split(",")}
    tokens.discard("")
    unknown = tokens.difference(VOICE_PARTS)
    if unknown:
        raise ValueError(
            f"Unknown section(s): {', '.join(sorted(unknown))}. "
            f"Use any of: {', '.join(VOICE_PARTS)}"
        )
    parts = [part for part in VOICE_PARTS if part in tokens]
    if not parts or len(parts) == len(VOICE_PARTS):
        return None
    return ",".join(parts)
