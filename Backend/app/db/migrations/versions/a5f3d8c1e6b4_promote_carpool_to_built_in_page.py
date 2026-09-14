"""promote carpool to a built-in page, drop group_custom_pages (B31)

Revision ID: a5f3d8c1e6b4
Revises: c4e8a2b0d7f3
Create Date: 2026-09-14 09:00:00.000000

Carpool (B23-B30) was built as the one template on the generic
`GroupCustomPage` system (per-group dynamic pages, slugs, draft/publish/
archive). No second template was ever built, so B31 drops that generic
layer entirely and promotes carpool to a built-in `GroupPage` (like
Homework/Members/etc, gated by `GroupPageSettings`) exactly like every
other page.

Order of operations, each safe to run against live prod data:
1. Add `carpool_events.group_id` (nullable at first).
2. Backfill it from each event's old `group_custom_pages` row (found via
   `page_id`) — every event's `page_id` is guaranteed to resolve (Postgres
   has always blocked deleting a page that still has events, no
   `ON DELETE CASCADE` exists on that FK), but a `None` lookup is skipped
   silently rather than crashing, for safety.
3. Seed one `group_page_settings(page='carpool')` row per group (reading
   every group id from `groups`, not from existing `group_page_settings`
   rows, so this also covers any edge-case group missing its base rows):
   a group with no `carpool_board` custom page gets carpool's own sensible
   default (members-only, matching every other built-in page's
   `DEFAULT_AUDIENCE` entry); a group with one or more (there was never a
   DB constraint stopping more than one) has its winner picked by
   `app.services.pages.resolve_carpool_page_settings_from_custom_pages`.
4. Make `carpool_events.group_id` non-null, drop `page_id`, drop
   `group_custom_pages`, in that order.

`downgrade()` is best-effort per the plan's own instruction: recreating
`group_custom_pages`'s structure is fine, perfectly reconstructing its
pre-migration row-level state is not required.
"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

from app.services.pages import resolve_carpool_page_settings_from_custom_pages

# revision identifiers, used by Alembic.
revision = 'a5f3d8c1e6b4'
down_revision = 'c4e8a2b0d7f3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    now = datetime.now(timezone.utc)
    connection = op.get_bind()

    op.add_column('carpool_events', sa.Column('group_id', sa.String(), nullable=True))

    # Step 2: backfill carpool_events.group_id from group_custom_pages.group_id
    # via the old page_id link.
    carpool_events_table = sa.table(
        'carpool_events',
        sa.column('id', sa.String),
        sa.column('page_id', sa.String),
        sa.column('group_id', sa.String),
    )
    group_custom_pages_table = sa.table(
        'group_custom_pages',
        sa.column('id', sa.String),
        sa.column('group_id', sa.String),
        sa.column('template_key', sa.String),
        sa.column('status', sa.String),
        sa.column('audience', sa.String),
        sa.column('min_identity', sa.String),
        sa.column('created_at', sa.DateTime),
    )
    page_group_by_id: dict[str, str] = {
        page_id: group_id
        for page_id, group_id in connection.execute(
            sa.select(group_custom_pages_table.c.id, group_custom_pages_table.c.group_id)
        ).fetchall()
    }
    event_rows = connection.execute(
        sa.select(carpool_events_table.c.id, carpool_events_table.c.page_id)
    ).fetchall()
    for event_id, page_id in event_rows:
        group_id = page_group_by_id.get(page_id)
        if group_id is None:
            # Shouldn't happen (see module docstring), but skip rather than
            # crash a prod migration over a data-integrity impossibility.
            continue
        connection.execute(
            carpool_events_table.update()
            .where(carpool_events_table.c.id == event_id)
            .values(group_id=group_id)
        )

    # Step 3: seed group_page_settings(page='carpool') for every group.
    groups_table = sa.table('groups', sa.column('id', sa.String))
    page_settings_table = sa.table(
        'group_page_settings',
        sa.column('id', sa.String),
        sa.column('group_id', sa.String),
        sa.column('page', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('audience', sa.String),
        sa.column('min_identity', sa.String),
        sa.column('created_at', sa.DateTime),
    )
    carpool_pages_by_group: dict[str, list[tuple[str, str, str, datetime]]] = {}
    for status_, audience, min_identity, created_at, group_id in connection.execute(
        sa.select(
            group_custom_pages_table.c.status,
            group_custom_pages_table.c.audience,
            group_custom_pages_table.c.min_identity,
            group_custom_pages_table.c.created_at,
            group_custom_pages_table.c.group_id,
        ).where(group_custom_pages_table.c.template_key == 'carpool_board')
    ).fetchall():
        carpool_pages_by_group.setdefault(group_id, []).append((status_, audience, min_identity, created_at))

    # Idempotency guard: `downgrade()` deliberately leaves these rows in
    # place (see its own comment), so an upgrade -> downgrade -> upgrade
    # cycle (a rollback, then reapplying) must not try to re-insert a row
    # that's already there and hit `uq_group_page_settings`.
    already_seeded_group_ids = {
        row[0]
        for row in connection.execute(
            sa.select(page_settings_table.c.group_id).where(page_settings_table.c.page == 'carpool')
        ).fetchall()
    }

    group_ids = [row[0] for row in connection.execute(sa.select(groups_table.c.id)).fetchall()]
    for group_id in group_ids:
        if group_id in already_seeded_group_ids:
            continue
        candidates = carpool_pages_by_group.get(group_id, [])
        enabled, audience, min_identity = resolve_carpool_page_settings_from_custom_pages(candidates)
        connection.execute(
            page_settings_table.insert().values(
                id=str(uuid.uuid4()),
                group_id=group_id,
                page='carpool',
                enabled=enabled,
                audience=audience,
                min_identity=min_identity,
                created_at=now,
            )
        )

    op.alter_column('carpool_events', 'group_id', nullable=False)
    op.drop_column('carpool_events', 'page_id')
    op.drop_table('group_custom_pages')


def downgrade() -> None:
    op.create_table(
        'group_custom_pages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column(
            'template_key',
            sa.Enum('carpool_board', name='groupcustompagetemplate', native_enum=False),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.Enum('draft', 'published', 'archived', name='groupcustompagestatus', native_enum=False),
            nullable=False,
            server_default='draft',
        ),
        sa.Column(
            'audience',
            sa.Enum('members', 'everyone', name='pageaudience', native_enum=False),
            nullable=False,
            server_default='members',
        ),
        sa.Column(
            'min_identity',
            sa.Enum('anyone', 'saved', name='pageminidentity', native_enum=False),
            nullable=False,
            server_default='anyone',
        ),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'slug', name='uq_group_custom_page_slug'),
    )

    op.add_column('carpool_events', sa.Column('page_id', sa.String(), nullable=True))

    now = datetime.now(timezone.utc)
    connection = op.get_bind()
    carpool_events_table = sa.table(
        'carpool_events',
        sa.column('id', sa.String),
        sa.column('group_id', sa.String),
        sa.column('page_id', sa.String),
    )
    group_custom_pages_table = sa.table(
        'group_custom_pages',
        sa.column('id', sa.String),
        sa.column('group_id', sa.String),
        sa.column('title', sa.String),
        sa.column('slug', sa.String),
        sa.column('template_key', sa.String),
        sa.column('status', sa.String),
        sa.column('audience', sa.String),
        sa.column('min_identity', sa.String),
        sa.column('created_at', sa.DateTime),
        sa.column('updated_at', sa.DateTime),
    )
    group_ids = {
        row[0]
        for row in connection.execute(sa.select(carpool_events_table.c.group_id).distinct()).fetchall()
    }
    for group_id in group_ids:
        page_id = str(uuid.uuid4())
        connection.execute(
            group_custom_pages_table.insert().values(
                id=page_id,
                group_id=group_id,
                title='Carpool',
                slug='carpool',
                template_key='carpool_board',
                status='published',
                audience='members',
                min_identity='anyone',
                created_at=now,
                updated_at=now,
            )
        )
        connection.execute(
            carpool_events_table.update()
            .where(carpool_events_table.c.group_id == group_id)
            .values(page_id=page_id)
        )

    op.alter_column('carpool_events', 'page_id', nullable=False)
    op.drop_column('carpool_events', 'group_id')
    # group_page_settings' carpool rows are left in place: harmless
    # leftover, not worth reconstructing pre-migration state (see module
    # docstring).
