"""team roles gain a mode (interest | roster), team_signups gain a
guest_name/contact roster path

Revision ID: e2b8f4a1c9d6
Revises: c80984a1e3db
Create Date: 2026-09-24 00:00:00.000000

Replaces a team-wide "open for signup" toggle (never shipped) with a
per-role one: a team can freely mix self-signup roles alongside
admin-maintained roster roles (e.g. "Publicity Team" keeps its self-signup
"Submit to media outlets" role right next to a roster-only "Team Lead"
role). `mode` defaults every existing role to `interest` (today's only
behavior, unchanged); `roster_visible_to_members` defaults `False`
(a fresh roster role starts hidden from members until an admin opts in).

`team_signups.user_id` becomes nullable and gains `guest_name`/`contact`,
mirroring `responsibility_signups`' own guest-name path (see
`c2e7f9a1d8b4_add_responsibility_signup_guest_name.py`): a roster entry for
someone with no Divisi account at all has `user_id` null and `guest_name`
set instead.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'e2b8f4a1c9d6'
down_revision = 'c80984a1e3db'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'team_roles',
        sa.Column(
            'mode',
            sa.Enum('interest', 'roster', name='teamrolemode', native_enum=False),
            nullable=False,
            server_default='interest',
        ),
    )
    op.add_column(
        'team_roles',
        sa.Column('roster_visible_to_members', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.alter_column('team_signups', 'user_id', existing_type=sa.String(), nullable=True)
    op.add_column('team_signups', sa.Column('guest_name', sa.String(), nullable=True))
    op.add_column('team_signups', sa.Column('contact', sa.String(), nullable=True))


def downgrade() -> None:
    # Assumes no guest_name-only (user_id IS NULL) rows exist at downgrade
    # time, same accepted tradeoff `a7e2c9f4b3d8`'s own downgrade documents
    # for its own nullable-to-non-nullable reversal.
    op.drop_column('team_signups', 'contact')
    op.drop_column('team_signups', 'guest_name')
    op.alter_column('team_signups', 'user_id', existing_type=sa.String(), nullable=False)
    op.drop_column('team_roles', 'roster_visible_to_members')
    op.drop_column('team_roles', 'mode')
