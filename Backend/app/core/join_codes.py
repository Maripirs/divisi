"""Generates a group's guest join code (B6).

Short and human-typeable by design (per the human's call — see B6 in
`Backend/plan.md`) rather than an opaque token: it's meant to be read aloud,
typed, or embedded in a shareable link (`<frontend>/join/{code}`) by a choir
admin, not just clicked. 8 chars over a 32-symbol alphabet (~40 bits) is
short enough to type comfortably while keeping brute-forcing impractical
when paired with the guest route's rate limiting (`app/core/rate_limit.py`).
"""

import secrets

# Excludes visually/aurally ambiguous characters: 0/O, 1/I/L.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_LENGTH = 8


# ASCII hyphen plus the Unicode hyphen/dash block (U+2010..U+2015) a code
# pasted from a chat or email might arrive with.
_DASHES = frozenset("-" + "".join(chr(c) for c in range(0x2010, 0x2016)))


def generate_join_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))


def normalize_join_code(raw: str) -> str:
    """The canonical form of a code as a person typed or read it aloud:
    whitespace and dashes stripped, uppercased, so "9cjm-7vru" and
    "9CJM 7VRU" both find the group whose code is "9CJM7VRU". Generated
    codes never contain either (see `_ALPHABET`), so this can't make two
    codes collide. The Frontend applies the same rule
    (`Frontend/src/lib/joinCode.ts`)."""
    return "".join(ch for ch in raw if not ch.isspace() and ch not in _DASHES).upper()
