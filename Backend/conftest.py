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
import tempfile
from pathlib import Path

os.environ.setdefault("BCRYPT_ROUNDS", "4")

# The developer .env may point at the production database and object store.
# Test imports happen after this file loads, so override those destinations
# before Settings can read .env. Keep every worker's files in its own temp
# directory, including tests that bypass the usual SQLite fixture.
_test_root = Path(tempfile.mkdtemp(prefix="divisi-pytest-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_test_root / 'test.db'}"
os.environ["STORAGE_DIR"] = str(_test_root / "storage")
os.environ["AWS_ENDPOINT_URL_S3"] = ""
os.environ["AWS_ACCESS_KEY_ID"] = ""
os.environ["AWS_SECRET_ACCESS_KEY"] = ""
