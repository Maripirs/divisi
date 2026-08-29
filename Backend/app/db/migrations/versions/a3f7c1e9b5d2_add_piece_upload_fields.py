"""add pieces.composer/youtube_url, piece_versions.pdf_file_path, widen file_path to nullable

Revision ID: a3f7c1e9b5d2
Revises: b4d8e2f6c9a1
Create Date: 2026-08-29 09:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a3f7c1e9b5d2'
down_revision = 'b4d8e2f6c9a1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('pieces', sa.Column('composer', sa.String(), nullable=True))
    op.add_column('pieces', sa.Column('youtube_url', sa.String(), nullable=True))
    op.add_column('piece_versions', sa.Column('pdf_file_path', sa.String(), nullable=True))
    op.alter_column('piece_versions', 'file_path', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    # Only safe if no row actually has file_path null at downgrade time —
    # matches this codebase's existing precedent of accepting that kind of
    # downgrade constraint rather than writing data-loss-avoidance logic
    # for a rarely-run path.
    op.alter_column('piece_versions', 'file_path', existing_type=sa.String(), nullable=False)
    op.drop_column('piece_versions', 'pdf_file_path')
    op.drop_column('pieces', 'youtube_url')
    op.drop_column('pieces', 'composer')
