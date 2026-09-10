"""JWT + password hashing helpers."""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import get_settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(get_settings().bcrypt_rounds)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def generate_reset_token() -> tuple[str, str]:
    """`(raw_token, token_hash)` — the raw token goes in the emailed/logged
    link and is never stored; only its hash sits in the DB, same reasoning
    as `hashed_password` (a DB leak alone shouldn't hand out usable reset
    links)."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_reset_token(raw)


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> str | None:
    """Return the subject (user id) if the token is valid, else None."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    return payload.get("sub")


def create_guest_token(group_id: str) -> str:
    """B10: a signed, stateless token proving the caller cleared a group's
    guest password. Same secret/algorithm as the member access token, but
    a distinct `gsub` claim and a `scope` marker so the two can never be
    mistaken for each other (see `decode_guest_token`)."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.guest_token_expire_minutes)
    payload = {"gsub": group_id, "scope": "guest", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_guest_token(token: str) -> str | None:
    """Return the group id if the token is a valid guest token, else None.
    The `scope == "guest"` check is what stops a member access token (which
    has no such claim) from ever being accepted as a guest token."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("scope") != "guest":
        return None
    return payload.get("gsub")


def create_participant_token(user_id: str, local_id: str) -> str:
    """B19: a signed device token for an anonymous participant. Same
    secret/algorithm as the member and guest tokens, but a distinct
    `scope = "participant"` marker plus `psub` (the participant's user id)
    and `lid` (the client's own local id) claims. Carried in the
    `divisi_participant` httpOnly cookie; it is the singer's only identity
    until they Save, hence the one-year life."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.participant_token_expire_minutes)
    payload = {"psub": user_id, "lid": local_id, "scope": "participant", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_participant_token(token: str) -> tuple[str, str] | None:
    """Return `(user_id, local_id)` if the token is a valid participant
    token, else None. `local_id` is `""` when the claim was empty. The
    `scope == "participant"` check stops a member or guest token from ever
    being accepted here."""
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("scope") != "participant":
        return None
    user_id = payload.get("psub")
    if not user_id:
        return None
    return user_id, payload.get("lid") or ""
