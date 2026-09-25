"""add teams, team_roles, team_signups tables, seed group_page_settings for it

Revision ID: c80984a1e3db
Revises: b5121cec851d
Create Date: 2026-09-24 00:00:00.000000

"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c80984a1e3db'
down_revision = 'b5121cec851d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'teams',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('contact_name', sa.String(), nullable=True),
        sa.Column('contact_email', sa.String(), nullable=True),
        sa.Column('contact_phone', sa.String(), nullable=True),
        sa.Column('contact_show_email', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('contact_show_phone', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_teams_group_id', 'teams', ['group_id'])

    op.create_table(
        'team_roles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('team_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('has_text_field', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_team_roles_team_id', 'team_roles', ['team_id'])

    op.create_table(
        'team_signups',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('role_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('text_value', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['role_id'], ['team_roles.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('role_id', 'user_id', name='uq_team_signup'),
    )
    op.create_index('ix_team_signups_role_id', 'team_signups', ['role_id'])
    op.create_index('ix_team_signups_user_id', 'team_signups', ['user_id'])

    # `GroupPageSettings.page` is a plain VARCHAR (see `b4d8e2f6c9a1_add_
    # weekly_notes.py`'s own comment on this), so adding the `teams` page
    # just means seeding one row per existing group. New groups get this
    # seeded at creation instead (`seed_default_page_settings`).
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
                page='teams',
                enabled=True,
                audience='members',
                created_at=now,
            )
        )


def downgrade() -> None:
    connection = op.get_bind()
    page_settings_table = sa.table('group_page_settings', sa.column('page', sa.String))
    connection.execute(page_settings_table.delete().where(page_settings_table.c.page == 'teams'))
    op.drop_table('team_signups')
    op.drop_table('team_roles')
    op.drop_table('teams')
