from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings

# Neon closes idle Postgres connections server-side (scale-to-zero /
# idle-connection timeout). Without `pool_pre_ping`, the first request to
# pull one of those from the pool after a quiet period gets a dead
# connection and fails with `psycopg2.OperationalError: SSL connection has
# been closed unexpectedly`, a 500 that a retry then "fixes" by landing on
# a fresh connection. `pool_pre_ping` issues a cheap `SELECT 1` before
# handing out a pooled connection and transparently reconnects if that
# fails, so a request never sees a stale connection at all. `pool_recycle`
# proactively retires connections before Neon's own idle timeout gets a
# chance to close them under us.
engine = create_engine(get_settings().database_url, future=True, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
