"""add piece_rehearsal_notes.source_weekly_note_id

Revision ID: d9b4e2c7f1a3
Revises: c3d7f1a9b4e2
Create Date: 2026-09-14 12:05:00.000000

Backlog: "promote a weekly note into a durable PieceRehearsalNote". Nullable,
no cascade-on-delete: see the column's own docstring on `PieceRehearsalNote`
in app/db/models.py for why a dangling id (rather than a null-out) is the
right call here.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'd9b4e2c7f1a3'
down_revision = 'c3d7f1a9b4e2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'piece_rehearsal_notes', sa.Column('source_weekly_note_id', sa.String(), nullable=True)
    )
    op.create_foreign_key(
        'fk_piece_rehearsal_notes_source_weekly_note_id_weekly_notes',
        'piece_rehearsal_notes',
        'weekly_notes',
        ['source_weekly_note_id'],
        ['id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_piece_rehearsal_notes_source_weekly_note_id_weekly_notes',
        'piece_rehearsal_notes',
        type_='foreignkey',
    )
    op.drop_column('piece_rehearsal_notes', 'source_weekly_note_id')
