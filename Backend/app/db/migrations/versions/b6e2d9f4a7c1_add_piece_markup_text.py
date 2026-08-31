"""add text content to piece markup marks

Revision ID: b6e2d9f4a7c1
Revises: f2b8d4a6c1e3
Create Date: 2026-08-30
"""

from alembic import op
import sqlalchemy as sa


revision = 'b6e2d9f4a7c1'
down_revision = 'f2b8d4a6c1e3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('piece_markup_marks', sa.Column('text', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('piece_markup_marks', 'text')
