"""add piece/version/distribution tables

Revision ID: a4e285e9b199
Revises: d6aefde7c90e
Create Date: 2026-08-26 16:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a4e285e9b199'
down_revision = 'd6aefde7c90e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'pieces',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('owner_type', sa.Enum('user', 'group', name='ownertype', native_enum=False), nullable=False),
        sa.Column('owner_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'piece_versions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('piece_id', sa.String(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            'source',
            sa.Enum('original', 'modification', name='versionsource', native_enum=False),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.Enum('draft', 'submitted', 'approved', 'rejected', name='versionstatus', native_enum=False),
            nullable=False,
        ),
        sa.Column('file_path', sa.String(), nullable=False),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['piece_id'], ['pieces.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'distributions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('piece_version_id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('distributed_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['piece_version_id'], ['piece_versions.id']),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('piece_version_id', 'group_id', name='uq_distribution'),
    )


def downgrade() -> None:
    op.drop_table('distributions')
    op.drop_table('piece_versions')
    op.drop_table('pieces')
