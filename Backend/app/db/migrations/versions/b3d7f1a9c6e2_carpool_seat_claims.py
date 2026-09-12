"""carpool seat claims (B27); drop CarpoolPost.seats_available

Revision ID: b3d7f1a9c6e2
Revises: a1c9e6f2b7d4
Create Date: 2026-09-12 12:00:00.000000

`CarpoolSeatClaim` is a new, small table rather than a repurposed
`CarpoolPost` row: claiming a seat shouldn't require the claimant to have
posted their own "I need a ride" first, so it links a user directly to a
driver's post. Soft-removed (`status`/`removed_at`), not hard-deleted, so a
released seat leaves a trace.

`carpool_posts.seats_available` is dropped: once claims exist, a
client-set count with no relationship to actual claims is a lie waiting to
happen. It's now computed on read (`seats_total` minus active claims), not
stored at all.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b3d7f1a9c6e2'
down_revision = 'a1c9e6f2b7d4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'carpool_seat_claims',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('driver_post_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('active', 'removed', name='carpoolseatclaimstatus', native_enum=False),
            nullable=False,
            server_default='active',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('removed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['driver_post_id'], ['carpool_posts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.drop_column('carpool_posts', 'seats_available')


def downgrade() -> None:
    op.add_column('carpool_posts', sa.Column('seats_available', sa.Integer(), nullable=True))
    op.drop_table('carpool_seat_claims')
