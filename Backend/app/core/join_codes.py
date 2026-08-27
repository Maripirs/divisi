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


def generate_join_code() -> str:
    return "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))
