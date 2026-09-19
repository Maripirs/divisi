"""add contact info to carpool claims and interests

Revision ID: 5d26b0620212
Revises: 1d15803153b5
Create Date: 2026-09-19 12:11:47.974655

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5d26b0620212'
down_revision = '1d15803153b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # B34: optional contact info left by the person claiming a seat / the
    # person expressing interest, so the matched post owner can reach them
    # back. Gated at read time (app.services.carpool), not here. The rest
    # of the drift autogenerate picked up (a carpool_events FK, a groups
    # join_code index/constraint swap, a piece_markup_marks index) is
    # unrelated pre-existing drift between this local DB and models.py,
    # deliberately left out of this migration.
    op.add_column('carpool_rider_interests', sa.Column('contact_phone', sa.String(), nullable=True))
    op.add_column('carpool_rider_interests', sa.Column('contact_email', sa.String(), nullable=True))
    op.add_column('carpool_seat_claims', sa.Column('contact_phone', sa.String(), nullable=True))
    op.add_column('carpool_seat_claims', sa.Column('contact_email', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('carpool_seat_claims', 'contact_email')
    op.drop_column('carpool_seat_claims', 'contact_phone')
    op.drop_column('carpool_rider_interests', 'contact_email')
    op.drop_column('carpool_rider_interests', 'contact_phone')
