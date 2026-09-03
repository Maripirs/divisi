"""add pieces.presentation

Revision ID: a2f6c1e4d9b7
Revises: c3e5a7b9d1f4
Create Date: 2026-09-03 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a2f6c1e4d9b7'
down_revision = 'c3e5a7b9d1f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pieces', sa.Column('presentation', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('pieces', 'presentation')
