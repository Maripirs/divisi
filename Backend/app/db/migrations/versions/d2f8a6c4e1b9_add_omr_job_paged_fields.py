"""add paged fields to omr jobs

Revision ID: d2f8a6c4e1b9
Revises: c1f7a4d2e8b6
Create Date: 2026-08-31
"""

from alembic import op
import sqlalchemy as sa


revision = 'd2f8a6c4e1b9'
down_revision = 'c1f7a4d2e8b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'omr_jobs',
        sa.Column('paged', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column('omr_jobs', sa.Column('needs_review', sa.Boolean(), nullable=True))
    op.add_column('omr_jobs', sa.Column('paged_report_path', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('omr_jobs', 'paged_report_path')
    op.drop_column('omr_jobs', 'needs_review')
    op.drop_column('omr_jobs', 'paged')
