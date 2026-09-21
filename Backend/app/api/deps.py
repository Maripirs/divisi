"""Shared FastAPI dependencies (DB session, current-user auth)."""

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token, decode_participant_token, pwd_ts
from app.db.models import User
from app.db.session import get_db

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
# B19: same bearer scheme, but `auto_error=False` so a route can accept
# "real member, or anonymous participant, or neither" without a missing
# Authorization header being an automatic 401.
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)

# B19: httpOnly cookie carrying the anonymous participant's device token
# (`create_participant_token`). Forwarded by the Frontend proxy the same
# way the guest token already is.
PARTICIPANT_COOKIE = "divisi_participant"


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    decoded = decode_access_token(token)
    if decoded is None:
        raise unauthorized
    user_id, token_pwd_ts = decoded
    if user_id is None:
        raise unauthorized
    user = db.get(User, user_id)
    if user is None or token_pwd_ts is None or pwd_ts(user.password_changed_at) != token_pwd_ts:
        raise unauthorized
    return user


def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme_optional),
    db: Session = Depends(get_db),
) -> User | None:
    """B19: the bearer user if a valid token is present, else None. Never
    raises (a route pairs this with `get_optional_participant` to serve
    members and anonymous participants from one handler)."""
    if not token:
        return None
    decoded = decode_access_token(token)
    if decoded is None:
        return None
    user_id, token_pwd_ts = decoded
    if user_id is None:
        return None
    user = db.get(User, user_id)
    if user is None or token_pwd_ts is None or pwd_ts(user.password_changed_at) != token_pwd_ts:
        return None
    return user


def get_optional_participant(
    request: Request,
    db: Session = Depends(get_db),
) -> User | None:
    """B19: resolve the `divisi_participant` cookie to its `User`
    (anonymous, or since-promoted) or None. Never raises."""
    raw = request.cookies.get(PARTICIPANT_COOKIE)
    if not raw:
        return None
    decoded = decode_participant_token(raw)
    if decoded is None:
        return None
    user_id, _local_id = decoded
    return db.get(User, user_id)
