"""add omr_jobs table

Revision ID: c9a1f2b7e4d3
Revises: b3c8f4e1d6a7
Create Date: 2026-08-27 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'c9a1f2b7e4d3'
down_revision = 'b3c8f4e1d6a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'omr_jobs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('source_file_path', sa.String(), nullable=False),
        sa.Column('result_musicxml_path', sa.String(), nullable=True),
        sa.Column('result_midi_path', sa.String(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('omr_jobs')
