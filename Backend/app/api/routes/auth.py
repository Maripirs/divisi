"""Auth routes: register, login, current-user check, password reset, and
OAuth (Google/Apple) sign-in."""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_optional_participant
from app.api.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    OAuthProviderStatusOut,
    ParticipantNameUpdate,
    ResetPasswordRequest,
    Token,
    UserCreate,
    UserLogin,
    UserOut,
    UserUpdate,
)
from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    generate_reset_token,
    hash_password,
    hash_reset_token,
    verify_password,
)
from app.db.models import (
    Annotation,
    AnnotationShare,
    Distribution,
    Group,
    GroupMembership,
    GroupRole,
    Homework,
    OAuthAccount,
    OAuthProvider,
    OmrJob,
    OwnerType,
    PasswordResetToken,
    Piece,
    PieceVersion,
    ResponsibilitySchedule,
    ResponsibilitySignup,
    User,
)
from app.db.session import get_db
from app.services.common import as_utc
from app.services.oauth import OAuthError, google_authorization_url, google_exchange_code
from app.services.participants import resolve_participant

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger("divisi.auth")

RESET_TOKEN_TTL = timedelta(hours=1)
OAUTH_STATE_COOKIE = "divisi_oauth_state"


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)) -> User:
    if db.query(User).filter(User.email == payload.email).first() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = User(email=payload.email, name=payload.name, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: UserLogin, db: Session = Depends(get_db)) -> Token:
    invalid = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    user = db.query(User).filter(User.email == payload.email).first()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise invalid
    return Token(access_token=create_access_token(subject=user.id))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    current_user.name = payload.name
    db.commit()
    db.refresh(current_user)
    return current_user


@router.patch("/participant/name")
def update_participant_name(
    payload: ParticipantNameUpdate,
    db: Session = Depends(get_db),
    maybe_participant: User | None = Depends(get_optional_participant),
) -> dict[str, bool]:
    """B22: best-effort background sync of a guest's local display name
    (Frontend Settings drawer) onto their server-side anonymous
    participant row. A no-op, not an error, when `resolve_participant`
    finds nothing yet (a shared action hasn't minted a row for this
    device) or when it resolves to a real, non-anonymous account -- that
    account's name only ever changes through `PUT /auth/me`, never here."""
    actor = resolve_participant(db, maybe_participant, payload.local_id)
    if actor is None or not actor.is_anonymous:
        return {"updated": False}

    normalized = payload.name.strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name is required")

    actor.name = normalized
    db.commit()
    return {"updated": True}


@router.put("/me/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Requires the current password, unlike `reset_password`'s token flow
    — a valid session alone isn't proof enough to change the one thing
    that would otherwise let the real owner lock out an attacker who
    stole the session, or vice versa."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Deletes the account and everything that's genuinely the user's own
    (annotations, their group memberships, their own responsibility
    signups, personally-owned pieces, password-reset tokens, OAuth
    links). Content shared with a group survives — a piece version,
    homework assignment, or responsibility schedule they created just
    loses its `created_by` attribution (now nullable specifically for
    this) rather than vanishing out from under everyone else. Blocked
    entirely if deleting them would leave any group with zero admins,
    same protection `remove_member`/`update_member_role` already give a
    group that isn't being dissolved."""
    user_id = current_user.id

    admin_memberships = (
        db.query(GroupMembership)
        .filter(GroupMembership.user_id == user_id, GroupMembership.role == GroupRole.admin)
        .all()
    )
    blocking_group_names: list[str] = []
    for membership in admin_memberships:
        remaining_admins = (
            db.query(GroupMembership)
            .filter(
                GroupMembership.group_id == membership.group_id,
                GroupMembership.role == GroupRole.admin,
                GroupMembership.user_id != user_id,
            )
            .count()
        )
        if remaining_admins == 0:
            group = db.get(Group, membership.group_id)
            blocking_group_names.append(group.name if group else membership.group_id)
    if blocking_group_names:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "You're the only admin of: "
                + ", ".join(blocking_group_names)
                + ". Promote another member to admin (or delete the group) before deleting your account."
            ),
        )

    # Personally-owned pieces (not group-owned) are deleted outright:
    # their versions, those versions' distributions, then the piece.
    personal_pieces = (
        db.query(Piece).filter(Piece.owner_type == OwnerType.user, Piece.owner_id == user_id).all()
    )
    for piece in personal_pieces:
        version_ids = [v.id for v in db.query(PieceVersion).filter(PieceVersion.piece_id == piece.id).all()]
        if version_ids:
            db.query(Distribution).filter(Distribution.piece_version_id.in_(version_ids)).delete(
                synchronize_session=False
            )
            db.query(PieceVersion).filter(PieceVersion.id.in_(version_ids)).delete(synchronize_session=False)
        db.delete(piece)

    # Null out attribution on content that belongs to a group, not to them.
    db.query(PieceVersion).filter(PieceVersion.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )
    db.query(PieceVersion).filter(PieceVersion.reviewed_by == user_id).update(
        {"reviewed_by": None}, synchronize_session=False
    )
    db.query(Homework).filter(Homework.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )
    db.query(ResponsibilitySchedule).filter(ResponsibilitySchedule.created_by == user_id).update(
        {"created_by": None}, synchronize_session=False
    )

    # Delete what's genuinely theirs: private notes (and any shares of
    # them), shares granted *to* them, their own group memberships, their
    # own responsibility signups, their own OMR jobs, and any outstanding
    # reset tokens / OAuth links.
    own_annotation_ids = [a.id for a in db.query(Annotation).filter(Annotation.user_id == user_id).all()]
    if own_annotation_ids:
        db.query(AnnotationShare).filter(AnnotationShare.annotation_id.in_(own_annotation_ids)).delete(
            synchronize_session=False
        )
        db.query(Annotation).filter(Annotation.id.in_(own_annotation_ids)).delete(synchronize_session=False)
    db.query(AnnotationShare).filter(AnnotationShare.shared_with_user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(ResponsibilitySignup).filter(ResponsibilitySignup.user_id == user_id).delete(
        synchronize_session=False
    )
    db.query(OmrJob).filter(OmrJob.user_id == user_id).delete(synchronize_session=False)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user_id).delete(synchronize_session=False)
    db.query(OAuthAccount).filter(OAuthAccount.user_id == user_id).delete(synchronize_session=False)
    db.query(GroupMembership).filter(GroupMembership.user_id == user_id).delete(synchronize_session=False)

    db.delete(current_user)
    db.commit()


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    """Always the same response whether or not the email has an account —
    otherwise this endpoint becomes a way to check who's registered.
    No email provider is wired up yet (see Backend/plan.md's Backlog), so
    the actual reset link is logged server-side rather than sent — real
    right now for an admin who can read Render's logs, not yet
    self-service for an arbitrary user."""
    user = db.query(User).filter(User.email == payload.email).first()
    if user is not None:
        raw_token, token_hash = generate_reset_token()
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=datetime.now(timezone.utc) + RESET_TOKEN_TTL,
            )
        )
        db.commit()
        reset_link = f"{get_settings().frontend_base_url}/reset-password?token={raw_token}"
        logger.warning("Password reset requested for %s -- link (valid 1h): %s", user.email, reset_link)
    return {"detail": "If that email has an account, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    invalid = HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset link")
    record = (
        db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == hash_reset_token(payload.token)).first()
    )
    if record is None or record.used_at is not None or as_utc(record.expires_at) < datetime.now(timezone.utc):
        raise invalid
    user = db.get(User, record.user_id)
    if user is None:
        raise invalid
    user.hashed_password = hash_password(payload.new_password)
    record.used_at = datetime.now(timezone.utc)
    db.commit()
    return {"detail": "Password updated"}


@router.get("/oauth/providers", response_model=OAuthProviderStatusOut)
def oauth_providers() -> OAuthProviderStatusOut:
    return OAuthProviderStatusOut(**get_settings().oauth_configured)


def _oauth_redirect_uri(request: Request, provider: str) -> str:
    return f"{str(request.base_url).rstrip('/')}/auth/oauth/{provider}/callback"


@router.get("/oauth/{provider}/start")
def oauth_start(provider: str, request: Request) -> RedirectResponse:
    settings = get_settings()
    if provider == "apple":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Apple Sign-In isn't implemented yet")
    if provider != "google":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider")
    if not settings.oauth_configured["google"]:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google Sign-In isn't configured on this server yet"
        )

    # A random `state`, round-tripped through a short-lived httpOnly cookie
    # (rather than server-side session storage, which this backend has
    # none of) and checked against the query param the callback gets back
    # — the standard CSRF guard for a redirect-based OAuth flow.
    state = secrets.token_urlsafe(24)
    url = google_authorization_url(settings.google_client_id, _oauth_redirect_uri(request, "google"), state)
    redirect = RedirectResponse(url)
    redirect.set_cookie(OAUTH_STATE_COOKIE, state, max_age=600, httponly=True, secure=True, samesite="lax")
    return redirect


@router.get("/oauth/{provider}/callback")
def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    settings = get_settings()
    error_redirect = RedirectResponse(f"{settings.frontend_base_url}/login?oauth_error=1")

    if provider == "apple":
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Apple Sign-In isn't implemented yet")
    if provider != "google":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown provider")
    if not settings.oauth_configured["google"]:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Google Sign-In isn't configured on this server yet"
        )

    if error or not code or not state:
        return error_redirect
    cookie_state = request.cookies.get(OAUTH_STATE_COOKIE)
    if not cookie_state or cookie_state != state:
        return error_redirect

    try:
        profile = google_exchange_code(
            settings.google_client_id,
            settings.google_client_secret,
            _oauth_redirect_uri(request, "google"),
            code,
        )
    except OAuthError as exc:
        logger.warning("Google OAuth exchange failed: %s", exc)
        return error_redirect

    oauth_account = (
        db.query(OAuthAccount)
        .filter(
            OAuthAccount.provider == OAuthProvider.google,
            OAuthAccount.provider_user_id == profile["provider_user_id"],
        )
        .first()
    )
    if oauth_account is not None:
        user = db.get(User, oauth_account.user_id)
        assert user is not None
    else:
        # Link to an existing password account with the same email rather
        # than creating a duplicate: otherwise someone who registered
        # with a password and later tries "Continue with Google" on the
        # same address ends up with two unrelated accounts.
        user = db.query(User).filter(User.email == profile["email"]).first()
        if user is None:
            # A real, unguessable password the user will never need: the
            # account is only ever unlocked via OAuth from here on, but
            # `hashed_password` is a required column, and using a random
            # value (never told to anyone) is simpler and safer than
            # making the whole column nullable for this one case.
            user = User(
                email=profile["email"],
                name=profile["name"],
                hashed_password=hash_password(secrets.token_urlsafe(32)),
            )
            db.add(user)
            db.flush()
        db.add(OAuthAccount(user_id=user.id, provider=OAuthProvider.google, provider_user_id=profile["provider_user_id"]))
    db.commit()

    access_token = create_access_token(subject=user.id)
    redirect = RedirectResponse(f"{settings.frontend_base_url}/login/oauth-callback?token={access_token}")
    redirect.delete_cookie(OAUTH_STATE_COOKIE)
    return redirect
