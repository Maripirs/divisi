"""B23: `GroupCustomPage` create/update/out shapes.

Structured fields only, same as every other model in this codebase, and
deliberately so: no `body`/`html` field exists anywhere here for a template
to render, which is what keeps "no arbitrary HTML accepted" true by
construction rather than by a sanitizer somewhere. `template_key` renders
whatever fixed layout that template implies (carpool board content is
B24's `CarpoolEvent`/`CarpoolPost`, scoped to this page's id)."""

from datetime import datetime

from pydantic import BaseModel

from app.db.models import GroupCustomPageStatus, GroupCustomPageTemplate, PageAudience, PageMinIdentity


class GroupCustomPageCreate(BaseModel):
    title: str
    # Required (not defaulted) even though it's a one-member enum today:
    # the caller should always say what it wants, since a second template
    # value later shouldn't silently change what an omitted field means.
    template_key: GroupCustomPageTemplate
    audience: PageAudience = PageAudience.members
    min_identity: PageMinIdentity = PageMinIdentity.anyone
    # B29: generic per-page toggle, off by default. Only the carpool_board
    # template wires it up today (`app/api/routes/carpool.py`'s guest/member
    # reads and F35's frontend), but it lives here rather than on a
    # carpool-specific schema since another template could reuse it later.
    map_enabled: bool = False


class GroupCustomPageUpdate(BaseModel):
    """Partial patch, checked via `model_fields_set` (same convention as
    `ResponsibilityScheduleUpdate`) — a field left out is left untouched.
    `slug` and `template_key` aren't here at all: both are immutable after
    create. `status` transitions are also reachable through the dedicated
    `/publish` and `/archive` actions, but are included here too so a
    caller can move a page back to `draft` ("unpublish") without a third
    single-purpose route for it."""

    title: str | None = None
    audience: PageAudience | None = None
    min_identity: PageMinIdentity | None = None
    status: GroupCustomPageStatus | None = None
    map_enabled: bool | None = None


class GroupCustomPageOut(BaseModel):
    id: str
    group_id: str
    title: str
    slug: str
    template_key: GroupCustomPageTemplate
    status: GroupCustomPageStatus
    audience: PageAudience
    min_identity: PageMinIdentity
    map_enabled: bool
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GuestTabsOut(BaseModel):
    """F31's guest tab strip needs `homework`/`weekly_notes`/
    `responsibilities` visibility plus the custom-pages list to render
    itself, but `pages/[slug]/+page.server.ts` doesn't otherwise need any
    of that data. Before this, it got the booleans as a side effect of
    fetching (and discarding) each page's full list, three separate
    guest calls just to learn a yes/no. This is that same set of flags in
    one call, backed by `require_guest_page_access`'s existing gate check
    rather than a real query against Homework/WeeklyNote/
    ResponsibilityDate at all, so it's cheaper than the three calls it
    replaces individually too, not just fewer round trips."""

    homework_visible: bool
    weekly_notes_visible: bool
    responsibilities_visible: bool
    custom_pages: list[GroupCustomPageOut]
