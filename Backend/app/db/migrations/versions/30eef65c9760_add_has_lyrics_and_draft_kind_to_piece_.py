"""add has_lyrics and draft_kind to piece_versions

Revision ID: 30eef65c9760
Revises: e2b8f4a1c9d6
Create Date: 2026-10-04 11:33:20.948011

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '30eef65c9760'
down_revision = 'e2b8f4a1c9d6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Hand-trimmed from the autogenerate output: it also picked up
    # pre-existing, unrelated schema drift (a carpool_events FK, a groups
    # join_code constraint/index swap) that has nothing to do with this
    # change -- left alone here rather than folded in.
    op.add_column('piece_versions', sa.Column('has_lyrics', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('piece_versions', sa.Column('draft_kind', sa.Enum('lyrics_generation', 'ai_edit', 'omr', name='draftkind', native_enum=False), nullable=True))


def downgrade() -> None:
    op.drop_column('piece_versions', 'draft_kind')
    op.drop_column('piece_versions', 'has_lyrics')
