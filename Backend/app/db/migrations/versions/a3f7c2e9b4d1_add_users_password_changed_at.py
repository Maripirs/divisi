"""add users.password_changed_at

Revision ID: a3f7c2e9b4d1
Revises: 5d26b0620212
Create Date: 2026-09-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f7c2e9b4d1'
down_revision = '5d26b0620212'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default backfills every existing row to "now"; kept on the
    # column afterwards (same convention as the other not-null-with-default
    # columns in this migrations tree, e.g. b1c3d5e7f9a2). Embedded in every
    # access token's `pwd_ts` claim so a password change (or reset) can
    # revoke every token minted before it -- see app/core/security.py.
    op.add_column(
        'users',
        sa.Column('password_changed_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
    )


def downgrade() -> None:
    op.drop_column('users', 'password_changed_at')
