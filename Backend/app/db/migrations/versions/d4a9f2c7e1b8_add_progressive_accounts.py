"""add progressive accounts: anonymous participants + page min_identity

Revision ID: d4a9f2c7e1b8
Revises: a2f6c1e4d9b7
Create Date: 2026-09-09 12:00:00.000000

B19. Five additive columns, all backfilled entirely by their server
defaults:
  users.is_anonymous          bool NOT NULL default false
  users.anonymous_local_id    varchar NULL, indexed
  users.pin_hash              varchar NULL
  group_memberships.is_guest  bool NOT NULL default false
  group_page_settings.min_identity  enum(anyone|saved) NOT NULL default anyone
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd4a9f2c7e1b8'
down_revision = 'a2f6c1e4d9b7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'users',
        sa.Column('is_anonymous', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column('users', sa.Column('anonymous_local_id', sa.String(), nullable=True))
    op.add_column('users', sa.Column('pin_hash', sa.String(), nullable=True))
    op.create_index('ix_users_anonymous_local_id', 'users', ['anonymous_local_id'])
    op.add_column(
        'group_memberships',
        sa.Column('is_guest', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'group_page_settings',
        sa.Column(
            'min_identity',
            sa.Enum('anyone', 'saved', name='pageminidentity', native_enum=False),
            nullable=False,
            server_default='anyone',
        ),
    )


def downgrade() -> None:
    op.drop_column('group_page_settings', 'min_identity')
    op.drop_column('group_memberships', 'is_guest')
    op.drop_index('ix_users_anonymous_local_id', table_name='users')
    op.drop_column('users', 'pin_hash')
    op.drop_column('users', 'anonymous_local_id')
    op.drop_column('users', 'is_anonymous')
