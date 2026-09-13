"""carpool map pins (B29): event destination coords, post origin coords +
precision, page map_enabled toggle

Revision ID: 9d09d03dff42
Revises: b3d7f1a9c6e2
Create Date: 2026-09-12 14:00:00.000000

Adds the coordinate columns the carpool feature deliberately deferred
through B24-B28 (see those milestones' `CarpoolEvent`/`CarpoolPost`
docstrings). All new columns are nullable, so a carpool board with only
free-text labels keeps working exactly as before.

`carpool_events` gets `destination_latitude`/`destination_longitude`/
`destination_place_id`: the venue pin, never rounded. A rehearsal hall
address is public, not privacy-sensitive the way a rider's home is.

`carpool_posts` gets `origin_latitude`/`origin_longitude`/`origin_place_id`
plus a new `origin_precision` enum (`exact`/`approximate`). This is a real
person's home or meeting point, so the server rounds it to 2 decimal
places (~1.1km grid) before it's ever written whenever precision is
`approximate` (the default whenever coordinates are given at all) rather
than trusting a client to have already done that rounding. Only an
explicit `exact` skips it. See `app/services/carpool.
resolve_origin_coordinates`, the one place this happens.

`group_custom_pages` gets `map_enabled` (`False` default, non-nullable):
an admin's per-page switch to turn the map on for a carpool board. It's
generic on the page model, not carpool-specific in name, since a later
template could reuse it, but only carpool_board wires it up today.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '9d09d03dff42'
down_revision = 'b3d7f1a9c6e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('carpool_events', sa.Column('destination_latitude', sa.Float(), nullable=True))
    op.add_column('carpool_events', sa.Column('destination_longitude', sa.Float(), nullable=True))
    op.add_column('carpool_events', sa.Column('destination_place_id', sa.String(), nullable=True))

    op.add_column('carpool_posts', sa.Column('origin_latitude', sa.Float(), nullable=True))
    op.add_column('carpool_posts', sa.Column('origin_longitude', sa.Float(), nullable=True))
    op.add_column('carpool_posts', sa.Column('origin_place_id', sa.String(), nullable=True))
    op.add_column(
        'carpool_posts',
        sa.Column(
            'origin_precision',
            sa.Enum('exact', 'approximate', name='carpoollocationprecision', native_enum=False),
            nullable=True,
        ),
    )

    op.add_column(
        'group_custom_pages',
        sa.Column('map_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('group_custom_pages', 'map_enabled')

    op.drop_column('carpool_posts', 'origin_precision')
    op.drop_column('carpool_posts', 'origin_place_id')
    op.drop_column('carpool_posts', 'origin_longitude')
    op.drop_column('carpool_posts', 'origin_latitude')

    op.drop_column('carpool_events', 'destination_place_id')
    op.drop_column('carpool_events', 'destination_longitude')
    op.drop_column('carpool_events', 'destination_latitude')
