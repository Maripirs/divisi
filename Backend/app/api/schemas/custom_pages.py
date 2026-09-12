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


class GroupCustomPageOut(BaseModel):
    id: str
    group_id: str
    title: str
    slug: str
    template_key: GroupCustomPageTemplate
    status: GroupCustomPageStatus
    audience: PageAudience
    min_identity: PageMinIdentity
    created_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
