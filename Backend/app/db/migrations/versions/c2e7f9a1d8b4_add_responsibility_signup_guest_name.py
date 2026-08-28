"""add responsibility_signups.guest_name, make user_id nullable

Revision ID: c2e7f9a1d8b4
Revises: b8f3a1d9c4e6
Create Date: 2026-08-28 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c2e7f9a1d8b4'
down_revision = 'b8f3a1d9c4e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('responsibility_signups', sa.Column('guest_name', sa.String(), nullable=True))
    op.alter_column('responsibility_signups', 'user_id', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    # Assumes no guest_name-only rows exist at downgrade time (same
    # accepted tradeoff as any other "add a nullable column, later make a
    # sibling column non-nullable again" downgrade in this project).
    op.alter_column('responsibility_signups', 'user_id', existing_type=sa.String(), nullable=False)
    op.drop_column('responsibility_signups', 'guest_name')
