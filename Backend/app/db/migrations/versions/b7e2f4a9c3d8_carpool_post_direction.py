"""carpool post direction: there / back / round_trip (B32)

Revision ID: b7e2f4a9c3d8
Revises: a5f3d8c1e6b4
Create Date: 2026-09-14 09:30:00.000000

A driver or rider post didn't distinguish "I'm driving to rehearsal" from
"I can bring people home after" — exactly where those diverge for a
concert or evening rehearsal. `direction` lets a post say which leg of the
trip it covers. `round_trip` is the default and the `server_default` for
every pre-existing row, since that's the closest match to today's
undifferentiated single-post behavior: no Python-loop backfill needed, the
`server_default` covers every existing row on its own.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b7e2f4a9c3d8'
down_revision = 'a5f3d8c1e6b4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'carpool_posts',
        sa.Column(
            'direction',
            sa.Enum('there', 'back', 'round_trip', name='carpoolpostdirection', native_enum=False),
            nullable=False,
            server_default='round_trip',
        ),
    )


def downgrade() -> None:
    op.drop_column('carpool_posts', 'direction')
