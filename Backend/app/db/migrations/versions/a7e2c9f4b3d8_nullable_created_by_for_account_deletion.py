"""make piece_versions.created_by, homework.created_by,
responsibility_schedules.created_by nullable

Needed so deleting a user account can null out attribution on shared
content (a group's piece version / homework / responsibility schedule)
instead of having to delete that content out from under the rest of the
group just because whoever created it deleted their account.

Revision ID: a7e2c9f4b3d8
Revises: f1a9d3c7b2e6
Create Date: 2026-08-28 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a7e2c9f4b3d8'
down_revision = 'f1a9d3c7b2e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('piece_versions', 'created_by', existing_type=sa.String(), nullable=True)
    op.alter_column('homework', 'created_by', existing_type=sa.String(), nullable=True)
    op.alter_column('responsibility_schedules', 'created_by', existing_type=sa.String(), nullable=True)


def downgrade() -> None:
    # Assumes no NULL created_by rows exist at downgrade time (same
    # accepted tradeoff as other nullable-to-non-nullable downgrades in
    # this project).
    op.alter_column('responsibility_schedules', 'created_by', existing_type=sa.String(), nullable=False)
    op.alter_column('homework', 'created_by', existing_type=sa.String(), nullable=False)
    op.alter_column('piece_versions', 'created_by', existing_type=sa.String(), nullable=False)
