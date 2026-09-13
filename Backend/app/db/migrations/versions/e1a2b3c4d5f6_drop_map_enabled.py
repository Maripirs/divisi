"""drop map_enabled (B29 removal): carpool map now shows whenever there's
an actual pin, no admin toggle

Revision ID: e1a2b3c4d5f6
Revises: 9d09d03dff42
Create Date: 2026-09-13 00:00:00.000000

`group_custom_pages.map_enabled` was an admin's per-page switch to turn the
carpool map on or off (see `9d09d03dff42_carpool_map_pins`'s docstring).
It's removed here: the frontend's `CarpoolMap.svelte` already gates on
whether there's a real pin to show (`hasAnyPin`, checked against
`CarpoolEvent.destination_*` and each `CarpoolPost.origin_*`), which is the
correct "should something render" condition on its own. Requiring the extra
`map_enabled` flag on top of that just meant an admin had to remember to
flip a second switch after adding a destination or a pin, for no privacy or
correctness benefit, so the column goes away rather than staying dead.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e1a2b3c4d5f6'
down_revision = '9d09d03dff42'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('group_custom_pages', 'map_enabled')


def downgrade() -> None:
    op.add_column(
        'group_custom_pages',
        sa.Column('map_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
