"""add piece_markup_marks.time_ms (cue points, B18)

Revision ID: c3e5a7b9d1f4
Revises: b1c3d5e7f9a2
Create Date: 2026-09-02 19:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3e5a7b9d1f4'
down_revision = 'b1c3d5e7f9a2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable, no server_default: only a `kind='cue'` mark ever sets it,
    # every existing row (strokes / stamps / text) stays null.
    op.add_column(
        'piece_markup_marks',
        sa.Column('time_ms', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('piece_markup_marks', 'time_ms')
