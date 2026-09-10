"""Test fixtures: an isolated SQLite DB per test, wired into the app via
dependency override so tests don't need a live Postgres.

`db_engine` / `db_session` are exposed for tests that need to seed or
inspect rows directly (e.g. B19's participant-merge unit tests seeding
`Annotation` rows); `client` reuses the same engine, so a `db_session`
requested alongside a `client` in one test sees that client's writes.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import models  # noqa: F401  (register models on Base.metadata)
from app.db import session as db_session_module
from app.db.session import Base, get_db
from app.main import app


@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def db_sessionmaker(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, autocommit=False)


@pytest.fixture()
def db_session(db_sessionmaker):
    session = db_sessionmaker()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(monkeypatch, db_sessionmaker):
    TestingSessionLocal = db_sessionmaker

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    # B8's OMR background task (app/jobs/omr_jobs.py) opens its own DB
    # session outside any FastAPI dependency, via `db_session_module.SessionLocal`
    # looked up at call time — patch it here too so that task lands in the
    # same in-memory test DB instead of trying to reach a real Postgres.
    monkeypatch.setattr(db_session_module, "SessionLocal", TestingSessionLocal)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
