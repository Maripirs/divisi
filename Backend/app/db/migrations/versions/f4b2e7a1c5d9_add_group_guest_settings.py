"""add group guest_password_hash + guest_homework_visible

Revision ID: f4b2e7a1c5d9
Revises: e1a9c6d4b8f2
Create Date: 2026-08-27 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f4b2e7a1c5d9'
down_revision = 'e1a9c6d4b8f2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('groups', sa.Column('guest_password_hash', sa.String(), nullable=True))
    op.add_column(
        'groups',
        sa.Column('guest_homework_visible', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('groups', 'guest_homework_visible')
    op.drop_column('groups', 'guest_password_hash')
