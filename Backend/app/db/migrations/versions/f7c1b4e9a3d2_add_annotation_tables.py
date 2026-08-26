"""add annotation/annotation-share tables

Revision ID: f7c1b4e9a3d2
Revises: a4e285e9b199
Create Date: 2026-08-26 17:20:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f7c1b4e9a3d2'
down_revision = 'a4e285e9b199'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'annotations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('piece_id', sa.String(), nullable=False),
        sa.Column('position', sa.String(), nullable=False),
        sa.Column('content', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['piece_id'], ['pieces.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'annotation_shares',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('annotation_id', sa.String(), nullable=False),
        sa.Column('shared_with_user_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['annotation_id'], ['annotations.id']),
        sa.ForeignKeyConstraint(['shared_with_user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('annotation_id', 'shared_with_user_id', name='uq_annotation_share'),
    )


def downgrade() -> None:
    op.drop_table('annotation_shares')
    op.drop_table('annotations')
