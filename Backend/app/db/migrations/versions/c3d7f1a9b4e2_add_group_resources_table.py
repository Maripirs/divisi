"""add group_resources table

Revision ID: c3d7f1a9b4e2
Revises: b7e2f4a9c3d8
Create Date: 2026-09-14 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c3d7f1a9b4e2'
down_revision = 'b7e2f4a9c3d8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'group_resources',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('label', sa.String(), nullable=False),
        sa.Column('url', sa.String(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('group_resources')
