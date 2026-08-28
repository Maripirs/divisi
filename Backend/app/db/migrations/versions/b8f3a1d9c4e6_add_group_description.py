"""add group description

Revision ID: b8f3a1d9c4e6
Revises: a1c4e8f2b6d9
Create Date: 2026-08-28 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b8f3a1d9c4e6'
down_revision = 'a1c4e8f2b6d9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('groups', sa.Column('description', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('groups', 'description')
