"""add groups.rehearsal_weekday, groups.rehearsal_time

Revision ID: d8b3f5a1c7e4
Revises: a3f7c1e9b5d2
Create Date: 2026-08-29 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd8b3f5a1c7e4'
down_revision = 'a3f7c1e9b5d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('groups', sa.Column('rehearsal_weekday', sa.Integer(), nullable=True))
    op.add_column('groups', sa.Column('rehearsal_time', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('groups', 'rehearsal_time')
    op.drop_column('groups', 'rehearsal_weekday')
