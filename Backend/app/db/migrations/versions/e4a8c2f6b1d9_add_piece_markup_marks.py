"""add piece_markup_marks table

Revision ID: e4a8c2f6b1d9
Revises: d8b3f5a1c7e4
Create Date: 2026-08-29 18:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e4a8c2f6b1d9'
down_revision = 'd8b3f5a1c7e4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'piece_markup_marks',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('piece_id', sa.String(), nullable=False),
        sa.Column('page_number', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('color', sa.String(), nullable=False),
        sa.Column('width', sa.Float(), nullable=True),
        sa.Column('points', sa.JSON(), nullable=True),
        sa.Column('stamp_type', sa.String(), nullable=True),
        sa.Column('x', sa.Float(), nullable=True),
        sa.Column('y', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['piece_id'], ['pieces.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_piece_markup_marks_piece_id', 'piece_markup_marks', ['piece_id'])


def downgrade() -> None:
    op.drop_index('ix_piece_markup_marks_piece_id', table_name='piece_markup_marks')
    op.drop_table('piece_markup_marks')
