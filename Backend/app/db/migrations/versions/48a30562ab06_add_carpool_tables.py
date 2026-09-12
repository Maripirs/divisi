"""add carpool_events and carpool_posts (B24: carpool board events + posts)

Revision ID: 48a30562ab06
Revises: 33efd3092bff
Create Date: 2026-09-11 16:00:00.000000

Two new tables only, no backfill: carpool boards are a brand-new B23
template with no existing rows to migrate.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '48a30562ab06'
down_revision = '33efd3092bff'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'carpool_events',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('page_id', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('destination_label', sa.String(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('open', 'locked', 'archived', name='carpooleventstatus', native_enum=False),
            nullable=False,
            server_default='open',
        ),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['page_id'], ['group_custom_pages.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'carpool_posts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('event_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column(
            'kind',
            sa.Enum('driver', 'rider', name='carpoolpostkind', native_enum=False),
            nullable=False,
        ),
        sa.Column(
            'status',
            sa.Enum('open', 'hidden', 'cancelled', name='carpoolpoststatus', native_enum=False),
            nullable=False,
            server_default='open',
        ),
        sa.Column('origin_label', sa.String(), nullable=False),
        sa.Column('seats_total', sa.Integer(), nullable=True),
        sa.Column('seats_available', sa.Integer(), nullable=True),
        sa.Column('leave_time_text', sa.String(), nullable=True),
        sa.Column('notes', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['carpool_events.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('carpool_posts')
    op.drop_table('carpool_events')
