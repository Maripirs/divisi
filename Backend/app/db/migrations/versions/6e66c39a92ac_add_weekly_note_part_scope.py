"""add part_scope to weekly_notes

Revision ID: 6e66c39a92ac
Revises: 30eef65c9760
Create Date: 2026-10-11 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6e66c39a92ac'
down_revision = '30eef65c9760'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Section tag ("tenor,bass"), same format as piece_rehearsal_notes'
    # existing part_scope column. Nullable with no default: every existing
    # note stays NULL, which means "for everyone".
    op.add_column('weekly_notes', sa.Column('part_scope', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('weekly_notes', 'part_scope')
