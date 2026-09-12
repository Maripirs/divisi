"""Guest access routes (B6): unauthenticated join-code entry into a group's
distributed pieces.

No `get_current_user` dependency anywhere in this router — that's the whole
point (see `Backend/plan.md`'s B6: choir members join a group's practice
tracks with no login, unless they want to save annotations later). Every
route is instead scoped by the join code -> its one `Group` -> that group's
actual `Distribution` rows, so a guest can never reach a piece id that
wasn't genuinely pushed to this group (no guessing a piece id into
arbitrary access). Rate-limited (`app/core/rate_limit.py`) as the
brute-force hardening called for in B6's plan.

A valid join code is now the guest credential on its own: holding the code
is treated as equivalent to having entered the group's guest password, so
these routes no longer gate on a password or a guest token (see
`_authorize_guest`). The guest password survives on exactly one path,
`POST /guest/{join_code}/auth`, which a no-`?code=` piece link calls to
check a visitor's entered member password before letting them in with the
code.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.schemas import (
    AdminPreviewOut,
    CarpoolEventOut,
    CarpoolPostOut,
    GroupCustomPageOut,
    GuestAuthIn,
    GuestAuthOut,
    GuestGroupOut,
    GuestNameMatchOut,
    GuestPieceOut,
    GuestPieceOwnerOut,
    GuestTabsOut,
    HomeworkOut,
    MarkupMarkOut,
    PieceRehearsalNoteOut,
    RenderManifestOut,
    ResponsibilityGuestDateOut,
    ResponsibilityGuestRoleCoverageOut,
    ResponsibilityGuestScheduleGroupOut,
    ResponsibilityGuestSignupOut,
    WeeklyNoteOut,
)
from app.core.config import get_settings
from app.core.rate_limit import rate_limit_guest
from app.core.security import create_admin_preview_token, create_guest_token, verify_password
from app.db.models import (
    CarpoolEvent,
    CarpoolPost,
    CarpoolPostStatus,
    Distribution,
    Group,
    GroupCustomPage,
    GroupCustomPageStatus,
    GroupCustomPageTemplate,
    GroupMembership,
    GroupPage,
    GroupRole,
    Homework,
    PageAudience,
    Piece,
    PieceMarkupMark,
    PieceRehearsalNote,
    PieceVersion,
    ResponsibilityDate,
    ResponsibilityDateSchedule,
    ResponsibilityRole,
    ResponsibilitySchedule,
    WeeklyNote,
)
from app.db.session import get_db
from app.rendering.pipeline import RenderError, is_midi_file, render_file_path, render_manifest
from app.services.carpool import list_events_ordered, serialize_post
from app.services.custom_pages import get_custom_page_by_slug_or_404
from app.services.pages import require_guest_page_access
from app.services.participants import find_guest_matches
from app.services.responsibilities import role_coverage, signup_display_name
from app.storage.files import resolve_existing_source_path

router = APIRouter(prefix="/guest", tags=["guest"], dependencies=[Depends(rate_limit_guest)])


def _source_path_or_404(file_path: str, what: str):
    """Local path for a stored file, 404ing (not 500ing) when the bytes are
    missing from storage. Mirrors `routes/library.py`'s helper."""
    try:
        return resolve_existing_source_path(file_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{what} is missing from storage — it may need to be re-uploaded",
        ) from exc


def _get_group_by_join_code_or_404(join_code: str, db: Session) -> Group:
    group = db.query(Group).filter(Group.join_code == join_code).first()
    if group is None:
        # Deliberately the same generic message an unauthenticated caller
        # would see for any other bad code — nothing here should help
        # distinguish "wrong code" from "code for a group with no pieces".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Join code not found")
    return group


def _authorize_guest(group: Group, password: str | None, token: str | None) -> None:
    """No-op now: a valid join code is the guest credential on its own, so
    reaching one of these routes with the right code is already enough. It
    is treated as equivalent to having entered the group's guest password.

    The function and its call sites (and the `password`/`token` query params
    they pass) are kept deliberately: re-introducing a per-route check later
    becomes a one-function change, and the routes' query-string shape does
    not churn in the meantime. The guest password itself lives on exactly
    one path now, `POST /guest/{join_code}/auth`, which the no-`?code=`
    piece-link gate calls to verify a visitor's entered member password
    before sending them in with the code.
    """
    # `group`/`password`/`token` are intentionally unused: see docstring.
    return


def _latest_distributed_version(group_id: str, piece_id: str, db: Session) -> PieceVersion | None:
    row = (
        db.query(PieceVersion)
        .join(Distribution, Distribution.piece_version_id == PieceVersion.id)
        .filter(Distribution.group_id == group_id, PieceVersion.piece_id == piece_id)
        .order_by(Distribution.distributed_at.desc())
        .first()
    )
    return row


# Registered before the `/{join_code}/...` routes on purpose: the literal
# `pieces` first segment can never collide with a join code (8 uppercase
# alphanumerics), and no `/{join_code}/...` route has `pieces` as its second
# segment with this segment count, but keeping it first removes any doubt
# about which route a `/guest/pieces/...` path resolves to.
@router.get("/pieces/{piece_id}/owner", response_model=GuestPieceOwnerOut)
def get_guest_piece_owner(piece_id: str, db: Session = Depends(get_db)) -> GuestPieceOwnerOut:
    """Map a bare piece id to the group it was distributed to: that group's
    name, its join code, and whether the group has a guest password
    (`guest_password_required`).

    Deliberately name + join code only — never any piece content — and no
    auth of any kind: no `get_current_user`, no `_authorize_guest`, no
    `require_guest_page_access`. It has to answer before the visitor has a
    password, so a bare `/piece/{id}` link (no `?code=`) can show a gate
    that names the owning group instead of an unexplained bounce to
    `/login`.

    The Frontend uses `guest_password_required` to decide what that gate
    does: `false` -> redirect straight into the guest player with
    `?code={join_code}` (a group with no guest password gates nothing);
    `true` -> show a "this piece belongs to {group}" card whose password
    field is checked against `POST /guest/{join_code}/auth`. Note that once
    the visitor is in with the code, the join code alone authorizes every
    read route (see `_authorize_guest`) — the guest password only ever
    gates this one no-`?code=` entry point. Accepted tradeoff: a piece id
    now reveals its owning group's name and join code to any caller, the
    same trust level as a shared join link (piece ids are non-guessable).
    """
    latest = (
        db.query(Distribution)
        .join(PieceVersion, Distribution.piece_version_id == PieceVersion.id)
        .filter(PieceVersion.piece_id == piece_id)
        .order_by(Distribution.distributed_at.desc())
        .first()
    )
    if latest is None:
        # Personal piece, or one never pushed to any group. Same generic
        # phrasing as `_get_group_by_join_code_or_404` — nothing here should
        # help tell "no such piece" apart from "piece exists but private".
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found")
    group = db.query(Group).filter(Group.id == latest.group_id).first()
    if group is None:
        # A distribution pointing at no group is a data-integrity
        # impossibility; fail closed rather than 500 if it ever happens.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found")
    return GuestPieceOwnerOut(
        group_name=group.name,
        join_code=group.join_code,
        guest_password_required=group.guest_password_hash is not None,
    )


@router.post("/{join_code}/auth")
def authenticate_guest(join_code: str, payload: GuestAuthIn, db: Session = Depends(get_db)) -> GuestAuthOut:
    """Verify the group's guest password and mint a signed guest token.

    This is the one place the guest password is still checked (B10 used to
    gate every guest route on it; the join code alone authorizes those
    now). Its sole caller is the bare `/piece/{join-code-less}` link gate on
    the Frontend: a visitor who has a piece link but no join code enters the
    member password here, gets the token cookie, and is then sent into the
    piece with `?code=`. Wrong or missing password on a protected group ->
    401; correct -> 200 with a token. A group with no guest password still
    returns a token (nothing to check), so the Frontend can treat "has a
    guest cookie" uniformly. Rate limited by the router-wide
    `rate_limit_guest` dependency."""
    group = _get_group_by_join_code_or_404(join_code, db)
    if group.guest_password_hash is not None:
        pw = payload.password
        if pw is None or not verify_password(pw, group.guest_password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect or missing group password")
    return GuestAuthOut(token=create_guest_token(group.id))


@router.get("/{join_code}/admin-preview", response_model=AdminPreviewOut)
def start_admin_preview(join_code: str, db: Session = Depends(get_db)) -> AdminPreviewOut:
    """B20: mints a read-only "preview Admin" session for the public demo
    group only (`Settings.demo_join_code`, unset means this always 404s).
    The token's subject is that group's real admin account, so every
    existing admin-only screen renders exactly as it would for them; a
    process-wide middleware (`app.main.block_admin_preview_writes`) rejects
    every non-GET request carrying it, so nothing a demo visitor does
    actually persists. 404, not 403, for a non-demo join code: this route
    shouldn't reveal which codes are real. `group_id` rides along so the
    Frontend can navigate straight into it."""
    settings = get_settings()
    if not settings.demo_join_code or join_code.upper() != settings.demo_join_code.upper():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    group = _get_group_by_join_code_or_404(join_code, db)
    admin_membership = (
        db.query(GroupMembership)
        .filter(GroupMembership.group_id == group.id, GroupMembership.role == GroupRole.admin)
        .order_by(GroupMembership.created_at.asc())
        .first()
    )
    if admin_membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return AdminPreviewOut(access_token=create_admin_preview_token(admin_membership.user_id), group_id=group.id)


@router.get("/{join_code}/name-matches", response_model=list[GuestNameMatchOut])
def get_guest_name_matches(join_code: str, name: str, db: Session = Depends(get_db)) -> list[GuestNameMatchOut]:
    """B21: candidates a typed name might already be, before a first
    shared action is submitted. The join page calls this to offer "is this
    you?" — confirming folds the caller into the matched row instead of
    minting a duplicate (see `ResponsibilitySignupCreate.claim_user_id`).
    Sourced entirely from `find_guest_matches`, so it carries the same
    safety boundary: only ever another *guest* already in this exact
    group, never a real member/admin, never a guest of a different group.
    Empty list when nothing matches — that's the common case, and it just
    means "proceed as a brand-new participant"."""
    group = _get_group_by_join_code_or_404(join_code, db)
    matches = find_guest_matches(db, group.id, name)
    out: list[GuestNameMatchOut] = []
    for user in matches:
        membership = (
            db.query(GroupMembership)
            .filter(GroupMembership.group_id == group.id, GroupMembership.user_id == user.id)
            .first()
        )
        out.append(
            GuestNameMatchOut(
                user_id=user.id,
                title=membership.title if membership else None,
                joined_at=membership.created_at if membership else user.created_at,
            )
        )
    return out


@router.get("/{join_code}", response_model=GuestGroupOut)
def resolve_join_code(
    join_code: str, password: str | None = None, token: str | None = None, db: Session = Depends(get_db)
) -> GuestGroupOut:
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    # B12: this route *is* the guest-facing "tracks" page (a group's
    # distributed pieces) — gated the same way homework is below, replacing
    # the old unconditional-for-guests behavior.
    require_guest_page_access(group.id, GroupPage.tracks, db)

    distributed_rows = (
        db.query(Distribution, PieceVersion, Piece)
        .join(PieceVersion, Distribution.piece_version_id == PieceVersion.id)
        .join(Piece, PieceVersion.piece_id == Piece.id)
        .filter(Distribution.group_id == group.id)
        .order_by(Distribution.distributed_at.desc())
        .all()
    )
    seen_piece_ids: set[str] = set()
    pieces: list[GuestPieceOut] = []
    for distribution, version, piece in distributed_rows:
        if piece.id in seen_piece_ids:
            continue  # keep only the most recently distributed version per piece
        seen_piece_ids.add(piece.id)
        pieces.append(
            GuestPieceOut(
                piece_id=piece.id,
                title=piece.title,
                version_id=version.id,
                distributed_at=distribution.distributed_at,
                composer=piece.composer,
                youtube_url=piece.youtube_url,
                presentation=piece.presentation,
                has_music=version.file_path is not None,
                has_pdf=version.pdf_file_path is not None,
            )
        )

    settings = get_settings()
    admin_preview_available = bool(settings.demo_join_code) and join_code.upper() == settings.demo_join_code.upper()
    return GuestGroupOut(group_name=group.name, pieces=pieces, admin_preview_available=admin_preview_available)


@router.get("/{join_code}/homework", response_model=list[HomeworkOut])
def list_guest_homework(
    join_code: str, password: str | None = None, token: str | None = None, db: Session = Depends(get_db)
) -> list[Homework]:
    """Read-only, same no-auth stance as the rest of this router — a
    homework assignment (title/range/instructions/due date) carries no more
    sensitivity than the piece titles already exposed above, so it's
    scoped by join code the same way, no membership required. Also gated
    by B12's `homework` page settings (default: enabled, members-only
    audience) — unlike tracks, homework isn't guest-visible by default
    even with a valid join code."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.homework, db)
    return (
        db.query(Homework)
        .filter(Homework.group_id == group.id)
        .order_by(Homework.due_date.asc().nulls_last(), Homework.created_at.asc())
        .all()
    )


@router.get("/{join_code}/weekly-notes", response_model=list[WeeklyNoteOut])
def list_guest_weekly_notes(
    join_code: str, password: str | None = None, token: str | None = None, db: Session = Depends(get_db)
) -> list[WeeklyNote]:
    """Read-only, same no-auth stance as `list_guest_homework` above — a
    weekly note carries no more sensitivity than homework does (`created_by`
    is a bare id, never surfaced as a name), so it reuses `WeeklyNoteOut`
    as-is rather than a hidden-identity variant. Gated by the `weekly_notes`
    page settings, members-only audience by default."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.weekly_notes, db)
    return (
        db.query(WeeklyNote)
        .filter(WeeklyNote.group_id == group.id)
        .order_by(WeeklyNote.note_date.desc(), WeeklyNote.created_at.desc())
        .all()
    )


@router.get("/{join_code}/pages/{slug}", response_model=GroupCustomPageOut)
def get_guest_custom_page(
    join_code: str,
    slug: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> GroupCustomPage:
    """B23: a custom page's guest gate is exactly `require_guest_page_access`
    given the page row itself instead of a `GroupPage` enum member (see
    `app/services/pages.py`) — `enabled` there is standing in for
    `status == published`, and a draft/archived page 404s exactly like a
    disabled built-in page would, never revealing its title."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    page = get_custom_page_by_slug_or_404(group.id, slug, db)
    require_guest_page_access(group.id, page, db)
    return page


@router.get("/{join_code}/pages", response_model=list[GroupCustomPageOut])
def list_guest_custom_pages(
    join_code: str, password: str | None = None, token: str | None = None, db: Session = Depends(get_db)
) -> list[GroupCustomPage]:
    """B25: mirrors `list_member_custom_pages`'s published-only list
    (`app/api/routes/custom_pages.py`) so a guest can discover a page
    without a shared slug link, further filtered to `audience == everyone`
    — the member list doesn't filter on audience since audience only ever
    decides guest reachability, not member visibility."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    return (
        db.query(GroupCustomPage)
        .filter(
            GroupCustomPage.group_id == group.id,
            GroupCustomPage.status == GroupCustomPageStatus.published,
            GroupCustomPage.audience == PageAudience.everyone,
        )
        .order_by(GroupCustomPage.created_at.asc())
        .all()
    )


@router.get("/{join_code}/tabs", response_model=GuestTabsOut)
def get_guest_tabs(
    join_code: str, password: str | None = None, token: str | None = None, db: Session = Depends(get_db)
) -> GuestTabsOut:
    """F31 fast-follow: `pages/[slug]/+page.server.ts` needs to know which
    of homework/weekly_notes/responsibilities are guest-visible to render
    its copy of the tab strip, but has no other use for those pages' actual
    data. It used to get the three booleans as a side effect of calling
    `list_guest_homework`/`list_guest_weekly_notes`/
    `list_guest_responsibility_dates` and discarding the result, which
    quadrupled (with `list_guest_custom_pages`) the guest requests a single
    page view cost, tripping `rate_limit_guest`'s 60-second window during
    perfectly normal tab-to-tab navigation. This checks
    `require_guest_page_access` directly (the same gate, no `Homework`/
    `WeeklyNote`/`ResponsibilityDate` query at all) and folds the custom
    pages list in alongside it, one call instead of four."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)

    def _visible(page: GroupPage) -> bool:
        try:
            require_guest_page_access(group.id, page, db)
            return True
        except HTTPException:
            return False

    custom_pages = (
        db.query(GroupCustomPage)
        .filter(
            GroupCustomPage.group_id == group.id,
            GroupCustomPage.status == GroupCustomPageStatus.published,
            GroupCustomPage.audience == PageAudience.everyone,
        )
        .order_by(GroupCustomPage.created_at.asc())
        .all()
    )
    return GuestTabsOut(
        homework_visible=_visible(GroupPage.homework),
        weekly_notes_visible=_visible(GroupPage.weekly_notes),
        responsibilities_visible=_visible(GroupPage.responsibilities),
        custom_pages=[GroupCustomPageOut.model_validate(p) for p in custom_pages],
    )


def _get_guest_carpool_page_or_404(group_id: str, slug: str, db: Session) -> GroupCustomPage:
    """Same by-slug resolution + `require_guest_page_access` gate as
    `get_guest_custom_page`, plus the same "wrong template is a caller
    mistake, not a privacy boundary" 400 `carpool.py`'s
    `_get_carpool_page_or_404` uses for a page reached by id."""
    page = get_custom_page_by_slug_or_404(group_id, slug, db)
    require_guest_page_access(group_id, page, db)
    if page.template_key != GroupCustomPageTemplate.carpool_board:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="This page is not a carpool board"
        )
    return page


def _get_guest_carpool_event_or_404(group_id: str, event_id: str, db: Session) -> CarpoolEvent:
    """Same "wrong group -> 404, not 403" shape as `carpool.py`'s own
    helpers: an event id from another group (or a bare made-up one) 404s
    exactly like a nonexistent one, then the owning page's guest gate
    applies on top."""
    event = db.get(CarpoolEvent, event_id)
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    page = db.get(GroupCustomPage, event.page_id)
    if page is None or page.group_id != group_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    require_guest_page_access(group_id, page, db)
    return event


@router.get("/{join_code}/pages/{slug}/carpool/events", response_model=list[CarpoolEventOut])
def list_guest_carpool_events(
    join_code: str,
    slug: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> list[CarpoolEvent]:
    """B25: the guest-facing carpool board, same events a member sees via
    `GET /groups/{id}/pages/{page_id}/carpool/events` — reached by slug
    since a guest never has a raw page id. B26: same standing-event
    bootstrap and ordering as the member route, via the shared
    `list_events_ordered` helper so the two paths can't drift apart."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    page = _get_guest_carpool_page_or_404(group.id, slug, db)
    return list_events_ordered(page.id, db)


@router.get("/{join_code}/carpool/events/{event_id}/posts", response_model=list[CarpoolPostOut])
def list_guest_carpool_posts(
    join_code: str,
    event_id: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> list[CarpoolPostOut]:
    """B25: read-only mirror of the member `GET /carpool/events/{id}/posts`
    — a guest is never an admin, so the moderated-out filter the member
    route only applies to a non-admin caller applies here unconditionally.
    B27: `serialize_post` is the same helper the member route uses, so the
    two can't ship a different `claims`/`seats_available` shape."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    event = _get_guest_carpool_event_or_404(group.id, event_id, db)
    posts = (
        db.query(CarpoolPost)
        .filter(CarpoolPost.event_id == event.id, CarpoolPost.status == CarpoolPostStatus.open)
        .order_by(CarpoolPost.created_at.asc())
        .all()
    )
    return [serialize_post(post, db) for post in posts]


@router.get("/{join_code}/responsibilities/dates", response_model=list[ResponsibilityGuestDateOut])
def list_guest_responsibility_dates(
    join_code: str, password: str | None = None, token: str | None = None, db: Session = Depends(get_db)
) -> list[ResponsibilityGuestDateOut]:
    """Read-only, same no-auth stance as the rest of this router. Unlike the
    member-facing `GET /groups/{id}/responsibilities/dates`, this route's
    real gate is reachability itself: it only answers at all when the
    group's admin set the `responsibilities` page's audience to `everyone`
    (see `require_guest_page_access`), and once a guest can reach it, they
    see the same signup names a member sees (see
    `ResponsibilityGuestRoleCoverageOut`) - just never an email or account
    id, those two stay member/admin-only. A date can carry several role
    sets at once (`schedules`), each its own group of roles, with coverage
    rolled up across all of them. Gated by B12's `responsibilities` page
    settings, same mechanism as homework."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.responsibilities, db)
    dates = (
        db.query(ResponsibilityDate)
        .join(ResponsibilityDateSchedule, ResponsibilityDateSchedule.date_id == ResponsibilityDate.id)
        .join(
            ResponsibilitySchedule,
            ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
        )
        .filter(ResponsibilitySchedule.group_id == group.id)
        .order_by(ResponsibilityDate.date.asc())
        .distinct()
        .all()
    )
    out: list[ResponsibilityGuestDateOut] = []
    for date in dates:
        schedules = (
            db.query(ResponsibilitySchedule)
            .join(
                ResponsibilityDateSchedule,
                ResponsibilityDateSchedule.schedule_id == ResponsibilitySchedule.id,
            )
            .filter(ResponsibilityDateSchedule.date_id == date.id)
            .order_by(ResponsibilityDateSchedule.created_at.asc())
            .all()
        )
        schedule_groups: list[ResponsibilityGuestScheduleGroupOut] = []
        for schedule in schedules:
            roles = (
                db.query(ResponsibilityRole)
                .filter(ResponsibilityRole.schedule_id == schedule.id)
                .order_by(ResponsibilityRole.created_at.asc())
                .all()
            )
            role_outs = []
            for role in roles:
                active_count, coverage_status, signups = role_coverage(date.id, role, db)
                role_outs.append(
                    ResponsibilityGuestRoleCoverageOut(
                        role_id=role.id,
                        role_name=role.name,
                        needed_count=role.needed_count,
                        active_count=active_count,
                        status=coverage_status,
                        signups=[
                            ResponsibilityGuestSignupOut(id=s.id, name=signup_display_name(s, u))
                            for s, u in signups
                        ],
                    )
                )
            schedule_groups.append(
                ResponsibilityGuestScheduleGroupOut(schedule_name=schedule.name, roles=role_outs)
            )
        out.append(
            ResponsibilityGuestDateOut(
                id=date.id,
                date=date.date,
                notes=date.notes,
                locked=date.locked,
                canceled=date.canceled,
                schedules=schedule_groups,
            )
        )
    return out


@router.get(
    "/{join_code}/pieces/{piece_id}/rehearsal-notes",
    response_model=list[PieceRehearsalNoteOut],
)
def list_guest_piece_rehearsal_notes(
    join_code: str,
    piece_id: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> list[PieceRehearsalNote]:
    """B16 expansion (2026-09-02): a guest viewing a group's piece sees the
    "From the director" rehearsal notes read-only. Deliberate asymmetry
    with the member list (`GET /groups/{id}/pieces/{id}/rehearsal-notes`,
    gated on `GroupPage.weekly_notes`): the guest path gates on the group's
    `tracks` page being enabled *and* `audience == everyone`, the human's
    call. Personal notes have no guest path. Same join-code + distribution
    scoping as the other guest piece routes; ordering matches the member
    list (oldest first)."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    if _latest_distributed_version(group.id, piece_id, db) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")
    return (
        db.query(PieceRehearsalNote)
        .filter(
            PieceRehearsalNote.piece_id == piece_id,
            PieceRehearsalNote.group_id == group.id,
        )
        .order_by(PieceRehearsalNote.created_at.asc())
        .all()
    )


@router.get(
    "/{join_code}/pieces/{piece_id}/cues",
    response_model=list[MarkupMarkOut],
)
def list_guest_piece_cues(
    join_code: str,
    piece_id: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> list[PieceMarkupMark]:
    """F22 / B18: the reference-recording "jump here" cue glyphs on a group's
    piece PDF, read-only for a guest (no session). Cue-only on purpose — the
    director pen/stamp/text ink that shares the `scope == "group"` markup layer
    has no guest path and stays members-only; a cue is a navigation aid ("jump
    the recording to here") rather than private markup, so it rides along with
    the guest PDF itself and renders for every viewer regardless of the
    member-facing "Show director markup" toggle. Same `tracks` page gate as the
    guest PDF and rehearsal-notes routes (page enabled *and*
    `audience == everyone`, the human's call), plus the usual join-code +
    distribution scoping. Ordering matches the member markup list (oldest
    first)."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    if _latest_distributed_version(group.id, piece_id, db) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")
    return (
        db.query(PieceMarkupMark)
        .filter(
            PieceMarkupMark.piece_id == piece_id,
            PieceMarkupMark.scope == "group",
            PieceMarkupMark.kind == "cue",
        )
        .order_by(PieceMarkupMark.created_at)
        .all()
    )


@router.get("/{join_code}/pieces/{piece_id}/manifest", response_model=RenderManifestOut)
def get_guest_piece_manifest(
    join_code: str,
    piece_id: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> RenderManifestOut:
    """Same manifest shape/pipeline as the authenticated
    `/library/versions/{id}/manifest` (B7) — scoped here to whatever
    version this group actually has distributed for this piece, rather
    than trusting a client-supplied version id."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    if not is_midi_file(version.file_path):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This version's file isn't a MIDI file")

    source_path = _source_path_or_404(version.file_path, "This piece's music file")
    try:
        manifest = render_manifest(version.id, source_path)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    base = f"/guest/{join_code}/pieces/{piece_id}/renders"
    return RenderManifestOut(
        piece_version_id=manifest["piece_version_id"],
        stems={name: f"{base}/{filename}" for name, filename in manifest["stems"].items()},
        musicxml_url=f"{base}/{manifest['musicxml']}",
        tempo_bpm=manifest["tempo_bpm"],
        time_signature=manifest["time_signature"],
        key_signature_fifths=manifest["key_signature_fifths"],
        ms_per_whole_note=manifest["ms_per_whole_note"],
        duration_ms=manifest["duration_ms"],
    )


@router.get("/{join_code}/pieces/{piece_id}/file")
def get_guest_piece_file(
    join_code: str,
    piece_id: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> FileResponse:
    """F5: raw music-file bytes for this group's currently-distributed
    version of a piece. Same join-code + page-settings gate as the manifest
    route; 404s cleanly when that version has no music file."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")
    if version.file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no music file")
    return FileResponse(_source_path_or_404(version.file_path, "This piece's music file"))


@router.get("/{join_code}/pieces/{piece_id}/pdf")
def get_guest_piece_pdf(
    join_code: str,
    piece_id: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> FileResponse:
    """Raw PDF bytes for this group's currently-distributed version of a
    piece. Same gate as the manifest route; 404s cleanly when that version
    has no PDF."""
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")
    if version.pdf_file_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="This version has no PDF")
    return FileResponse(_source_path_or_404(version.pdf_file_path, "This piece's PDF"))


@router.get("/{join_code}/pieces/{piece_id}/renders/{filename}")
def get_guest_render_file(
    join_code: str,
    piece_id: str,
    filename: str,
    password: str | None = None,
    token: str | None = None,
    db: Session = Depends(get_db),
) -> FileResponse:
    group = _get_group_by_join_code_or_404(join_code, db)
    _authorize_guest(group, password, token)
    require_guest_page_access(group.id, GroupPage.tracks, db)
    version = _latest_distributed_version(group.id, piece_id, db)
    if version is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Piece not found for this group")

    try:
        path = render_file_path(version.id, filename)
    except RenderError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return FileResponse(path)
