"""add piece_rehearsal_notes table

Revision ID: d7e3a9c1f6b4
Revises: c1f7a4d2e8b6
Create Date: 2026-09-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd7e3a9c1f6b4'
down_revision = 'c1f7a4d2e8b6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'piece_rehearsal_notes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('piece_id', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('body', sa.String(), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=True),
        sa.Column('measure_label', sa.String(), nullable=True),
        sa.Column('part_scope', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['piece_id'], ['pieces.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('piece_rehearsal_notes')
