"""drop users.pin_hash (B21: PIN save replaced by name-match reconnect)

Revision ID: e5c1a9f3b7d2
Revises: d4a9f2c7e1b8
Create Date: 2026-09-11 12:00:00.000000

B21 drops B19's "Save across devices" PIN mechanism entirely (no real
users have ever used it) in favor of a group-scoped guest name match. The
column is unused in prod, so this is a clean drop with no backfill.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e5c1a9f3b7d2'
down_revision = 'd4a9f2c7e1b8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('users', 'pin_hash')


def downgrade() -> None:
    op.add_column('users', sa.Column('pin_hash', sa.String(), nullable=True))
