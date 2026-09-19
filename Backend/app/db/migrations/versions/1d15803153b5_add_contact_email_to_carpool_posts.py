"""add contact_email to carpool_posts

Revision ID: 1d15803153b5
Revises: d9b4e2c7f1a3
Create Date: 2026-09-18 18:24:47.107218

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1d15803153b5'
down_revision = 'd9b4e2c7f1a3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('carpool_posts', sa.Column('contact_email', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('carpool_posts', 'contact_email')
