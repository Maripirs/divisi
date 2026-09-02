"""Pytest session setup that must run before `app` is imported.

`app.core.config.Settings` reads `BCRYPT_ROUNDS` from the environment
(default 12). Force it down to bcrypt's minimum here so the auth-heavy
suite isn't dominated by password hashing: at the production cost factor
the full suite is ~7.5 minutes, almost all of it in `bcrypt.hashpw` /
`checkpw` from the hundreds of register/login calls tests make; at 4
rounds it's ~40 seconds with identical behavior. `setdefault` so an
explicit `BCRYPT_ROUNDS=...` in the environment still wins.
"""

import os

os.environ.setdefault("BCRYPT_ROUNDS", "4")
