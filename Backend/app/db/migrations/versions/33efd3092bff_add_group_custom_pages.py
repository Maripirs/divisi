"""add group_custom_pages (B23: custom group pages foundation)

Revision ID: 33efd3092bff
Revises: e5c1a9f3b7d2
Create Date: 2026-09-11 15:00:00.000000

New table only, no backfill: this is a brand-new admin-created page type,
so no existing group has any rows to migrate.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '33efd3092bff'
down_revision = 'e5c1a9f3b7d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'group_custom_pages',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('slug', sa.String(), nullable=False),
        sa.Column(
            'template_key',
            sa.Enum('carpool_board', name='groupcustompagetemplate', native_enum=False),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.Enum('draft', 'published', 'archived', name='groupcustompagestatus', native_enum=False),
            nullable=False,
            server_default='draft',
        ),
        sa.Column(
            'audience',
            sa.Enum('members', 'everyone', name='pageaudience', native_enum=False),
            nullable=False,
            server_default='members',
        ),
        sa.Column(
            'min_identity',
            sa.Enum('anyone', 'saved', name='pageminidentity', native_enum=False),
            nullable=False,
            server_default='anyone',
        ),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('group_id', 'slug', name='uq_group_custom_page_slug'),
    )


def downgrade() -> None:
    op.drop_table('group_custom_pages')
