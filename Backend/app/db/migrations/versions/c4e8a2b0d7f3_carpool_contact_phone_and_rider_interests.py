"""carpool contact phone + rider interests (B30)

Revision ID: c4e8a2b0d7f3
Revises: e1a2b3c4d5f6
Create Date: 2026-09-13 12:00:00.000000

`carpool_posts.contact_phone` is an opt-in phone number, gated at read time
by who's asking (`app/services/carpool.serialize_post`) rather than by
anything stored here: the post's own owner, a group admin, or a matched
counterparty (a rider who claimed a driver's seat, or a driver who
expressed interest in a rider's post) see the real value, everyone else
gets `None`.

`carpool_rider_interests` is the rider-post mirror of `carpool_seat_claims`
(B27): a driver expressing interest in one rider's post, since a rider's
request has no seats to claim. Soft-removed (`status`/`removed_at`), not
hard-deleted, same trace-left-behind reasoning as `carpool_seat_claims`.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c4e8a2b0d7f3'
down_revision = 'e1a2b3c4d5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('carpool_posts', sa.Column('contact_phone', sa.String(), nullable=True))
    op.create_table(
        'carpool_rider_interests',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('rider_post_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('display_name', sa.String(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('active', 'removed', name='carpoolriderintereststatus', native_enum=False),
            nullable=False,
            server_default='active',
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('removed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['rider_post_id'], ['carpool_posts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('carpool_rider_interests')
    op.drop_column('carpool_posts', 'contact_phone')
