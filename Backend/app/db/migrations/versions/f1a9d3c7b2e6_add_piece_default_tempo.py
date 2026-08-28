"""add pieces.default_tempo_bpm

Revision ID: f1a9d3c7b2e6
Revises: e9c3b1a7d5f2
Create Date: 2026-08-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f1a9d3c7b2e6'
down_revision = 'e9c3b1a7d5f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pieces', sa.Column('default_tempo_bpm', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('pieces', 'default_tempo_bpm')
