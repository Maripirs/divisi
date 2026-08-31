"""link omr jobs to a piece

Revision ID: c1f7a4d2e8b6
Revises: b6e2d9f4a7c1
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa


revision = 'c1f7a4d2e8b6'
down_revision = 'b6e2d9f4a7c1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('omr_jobs', sa.Column('piece_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'fk_omr_jobs_piece_id_pieces', 'omr_jobs', 'pieces', ['piece_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_omr_jobs_piece_id_pieces', 'omr_jobs', type_='foreignkey')
    op.drop_column('omr_jobs', 'piece_id')
