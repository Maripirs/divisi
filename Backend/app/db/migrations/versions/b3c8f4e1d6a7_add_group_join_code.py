"""add group join_code

Revision ID: b3c8f4e1d6a7
Revises: f7c1b4e9a3d2
Create Date: 2026-08-27 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

from app.core.join_codes import generate_join_code

# revision identifiers, used by Alembic.
revision = 'b3c8f4e1d6a7'
down_revision = 'f7c1b4e9a3d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('groups', sa.Column('join_code', sa.String(), nullable=True))

    # Backfill existing groups with a unique code before the column is made
    # required — new groups get one at creation time (see groups.py), but
    # any group already in the table predates that and has none yet.
    connection = op.get_bind()
    groups_table = sa.table('groups', sa.column('id', sa.String), sa.column('join_code', sa.String))
    existing_ids = [row[0] for row in connection.execute(sa.select(groups_table.c.id))]
    seen: set[str] = set()
    for group_id in existing_ids:
        code = generate_join_code()
        while code in seen:
            code = generate_join_code()
        seen.add(code)
        connection.execute(groups_table.update().where(groups_table.c.id == group_id).values(join_code=code))

    op.alter_column('groups', 'join_code', nullable=False)
    op.create_unique_constraint('uq_groups_join_code', 'groups', ['join_code'])
    op.create_index('ix_groups_join_code', 'groups', ['join_code'])


def downgrade() -> None:
    op.drop_index('ix_groups_join_code', table_name='groups')
    op.drop_constraint('uq_groups_join_code', 'groups', type_='unique')
    op.drop_column('groups', 'join_code')
