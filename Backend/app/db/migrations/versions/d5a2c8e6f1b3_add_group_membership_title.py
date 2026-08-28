"""add group_memberships.title

Revision ID: d5a2c8e6f1b3
Revises: c2e7f9a1d8b4
Create Date: 2026-08-28 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd5a2c8e6f1b3'
down_revision = 'c2e7f9a1d8b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('group_memberships', sa.Column('title', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('group_memberships', 'title')
