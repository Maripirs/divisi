"""add piece_markup_marks.scope (personal | group)

Revision ID: b1c3d5e7f9a2
Revises: f9d4c1a7b2e8
Create Date: 2026-09-02 17:13:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b1c3d5e7f9a2'
down_revision = 'f9d4c1a7b2e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills every existing row to 'personal'; kept on the
    # column afterwards (same convention as the other not-null-with-default
    # columns in this migrations tree, e.g. f4b2e7a1c5d9).
    op.add_column(
        'piece_markup_marks',
        sa.Column('scope', sa.String(), nullable=False, server_default='personal'),
    )


def downgrade() -> None:
    op.drop_column('piece_markup_marks', 'scope')
