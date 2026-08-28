"""add weekly_notes table, seed group_page_settings for it

Revision ID: b4d8e2f6c9a1
Revises: a7e2c9f4b3d8
Create Date: 2026-08-28 19:30:00.000000

"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b4d8e2f6c9a1'
down_revision = 'a7e2c9f4b3d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'weekly_notes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('body', sa.String(), nullable=False),
        sa.Column('note_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # `GroupPageSettings.page` is a plain VARCHAR (SQLAlchemy 2.0's
    # `Enum(..., native_enum=False)` no longer emits a CHECK constraint by
    # default), so adding a new page just means seeding one
    # `weekly_notes` row per existing group — no column/constraint ALTER
    # needed, same as every other page already stored there. New groups get
    # this seeded at creation instead (`seed_default_page_settings`).
    connection = op.get_bind()
    groups_table = sa.table('groups', sa.column('id', sa.String))
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
    rows = connection.execute(sa.select(groups_table.c.id)).fetchall()
    for (group_id,) in rows:
        connection.execute(
            page_settings_table.insert().values(
                id=str(uuid.uuid4()),
                group_id=group_id,
                page='weekly_notes',
                enabled=True,
                audience='members',
                created_at=now,
            )
        )


def downgrade() -> None:
    connection = op.get_bind()
    page_settings_table = sa.table('group_page_settings', sa.column('page', sa.String))
    connection.execute(page_settings_table.delete().where(page_settings_table.c.page == 'weekly_notes'))
    op.drop_table('weekly_notes')
