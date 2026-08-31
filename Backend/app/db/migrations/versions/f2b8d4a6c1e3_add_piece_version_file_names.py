"""add piece_versions.file_name/pdf_file_name (original uploaded filenames, display-only)

Revision ID: f2b8d4a6c1e3
Revises: e4a8c2f6b1d9
Create Date: 2026-08-30 17:10:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f2b8d4a6c1e3'
down_revision = 'e4a8c2f6b1d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('piece_versions', sa.Column('file_name', sa.String(), nullable=True))
    op.add_column('piece_versions', sa.Column('pdf_file_name', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('piece_versions', 'pdf_file_name')
    op.drop_column('piece_versions', 'file_name')
