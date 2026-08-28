"""add responsibilities tables (schedules, roles, dates, signups)

Revision ID: a1c4e8f2b6d9
Revises: 3d1749b04685
Create Date: 2026-08-28 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'a1c4e8f2b6d9'
down_revision = '3d1749b04685'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'responsibility_schedules',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('group_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['group_id'], ['groups.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'responsibility_roles',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('schedule_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('needed_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['schedule_id'], ['responsibility_schedules.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'responsibility_dates',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('schedule_id', sa.String(), nullable=False),
        sa.Column('date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('notes', sa.String(), nullable=False, server_default=''),
        sa.Column('locked', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('canceled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['schedule_id'], ['responsibility_schedules.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'responsibility_signups',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('date_id', sa.String(), nullable=False),
        sa.Column('role_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['date_id'], ['responsibility_dates.id']),
        sa.ForeignKeyConstraint(['role_id'], ['responsibility_roles.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date_id', 'role_id', 'user_id', name='uq_responsibility_signup'),
    )


def downgrade() -> None:
    op.drop_table('responsibility_signups')
    op.drop_table('responsibility_dates')
    op.drop_table('responsibility_roles')
    op.drop_table('responsibility_schedules')
