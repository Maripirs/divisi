"""carpool events gain a standing (non-dated) shape (B26)

Revision ID: a1c9e6f2b7d4
Revises: 48a30562ab06
Create Date: 2026-09-12 10:00:00.000000

`starts_at`/`destination_label` become nullable so the one page-scoped
standing event (no date, no destination) can live in the same table as
dated ones; `is_standing` marks which row that is. No backfill: existing
rows are all dated events and keep `is_standing = False` via the server
default.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1c9e6f2b7d4'
down_revision = '48a30562ab06'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('carpool_events', 'starts_at', nullable=True)
    op.alter_column('carpool_events', 'destination_label', nullable=True)
    op.add_column(
        'carpool_events',
        sa.Column('is_standing', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('carpool_events', 'is_standing')
    op.alter_column('carpool_events', 'destination_label', nullable=False)
    op.alter_column('carpool_events', 'starts_at', nullable=False)
