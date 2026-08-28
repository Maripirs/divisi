"""add group_page_settings, drop groups.guest_homework_visible

Revision ID: 3d1749b04685
Revises: f4b2e7a1c5d9
Create Date: 2026-08-28 10:00:00.000000

"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '3d1749b04685'
down_revision = 'f4b2e7a1c5d9'
branch_labels = None
depends_on = None

# B12's 5 pages and each one's "matches today's behavior" default, used both
# by new-group seeding (app/api/routes/groups.py) and this migration's
# backfill for groups that predate B12.
_PAGES_ENABLED_EVERYONE = {"tracks"}  # guests could always see distributed pieces, unconditionally
_ALL_PAGES = ["homework", "tracks", "members", "about", "responsibilities"]


def upgrade() -> None:
    op.create_table(
        'group_page_settings',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column(
            'page',
            sa.Enum('homework', 'tracks', 'members', 'about', 'responsibilities', name='grouppage', native_enum=False),
            nullable=False,
        ),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column(
            'audience',
            sa.Enum('members', 'everyone', name='pageaudience', native_enum=False),
            nullable=False,
            server_default='members',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'page', name='uq_group_page_settings'),
    )

    # Backfill: every pre-B12 group gets one row per page, matching its
    # actual pre-B12 behavior — homework's audience carries forward the old
    # `guest_homework_visible` flag; every other page defaults to whatever
    # was already true unconditionally (tracks were always guest-visible,
    # members/about/responsibilities had no guest route at all).
    connection = op.get_bind()
    groups_table = sa.table(
        'groups', sa.column('id', sa.String), sa.column('guest_homework_visible', sa.Boolean)
    )
    page_settings_table = sa.table(
        'group_page_settings',
        sa.column('id', sa.String),
        sa.column('group_id', sa.String),
        sa.column('page', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('audience', sa.String),
        sa.column('created_at', sa.DateTime),
    )
    now = datetime.now(timezone.utc)
    rows = connection.execute(sa.select(groups_table.c.id, groups_table.c.guest_homework_visible)).fetchall()
    for group_id, guest_homework_visible in rows:
        for page in _ALL_PAGES:
            if page == "homework":
                audience = "everyone" if guest_homework_visible else "members"
            else:
                audience = "everyone" if page in _PAGES_ENABLED_EVERYONE else "members"
            connection.execute(
                page_settings_table.insert().values(
                    id=str(uuid.uuid4()),
                    group_id=group_id,
                    page=page,
                    enabled=True,
                    audience=audience,
                    created_at=now,
                )
            )

    op.drop_column('groups', 'guest_homework_visible')


def downgrade() -> None:
    op.add_column(
        'groups',
        sa.Column('guest_homework_visible', sa.Boolean(), nullable=False, server_default='false'),
    )

    connection = op.get_bind()
    groups_table = sa.table('groups', sa.column('id', sa.String), sa.column('guest_homework_visible', sa.Boolean))
    page_settings_table = sa.table(
        'group_page_settings',
        sa.column('group_id', sa.String),
        sa.column('page', sa.String),
        sa.column('enabled', sa.Boolean),
        sa.column('audience', sa.String),
    )
    homework_rows = connection.execute(
        sa.select(page_settings_table.c.group_id, page_settings_table.c.enabled, page_settings_table.c.audience).where(
            page_settings_table.c.page == "homework"
        )
    ).fetchall()
    for group_id, enabled, audience in homework_rows:
        visible = bool(enabled) and audience == "everyone"
        connection.execute(
            groups_table.update().where(groups_table.c.id == group_id).values(guest_homework_visible=visible)
        )

    op.drop_table('group_page_settings')
