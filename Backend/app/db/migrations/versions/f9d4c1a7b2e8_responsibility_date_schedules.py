"""responsibility date -> schedule becomes many-to-many

Revision ID: f9d4c1a7b2e8
Revises: d7e3a9c1f6b4
Create Date: 2026-09-01 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'f9d4c1a7b2e8'
down_revision = 'e7b1c9d3a2f4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'responsibility_date_schedules',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('date_id', sa.String(), nullable=False),
        sa.Column('schedule_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['date_id'], ['responsibility_dates.id']),
        sa.ForeignKeyConstraint(['schedule_id'], ['responsibility_schedules.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('date_id', 'schedule_id', name='uq_responsibility_date_schedule'),
    )

    # Backfill: every existing date keeps its current single role-set
    # binding as one join row. `gen_random_uuid()` is available on the Neon
    # Postgres this runs against (PG13+ core); the `::text` cast matches the
    # String primary key. Done as one set-based statement rather than the
    # row-by-row `connection.execute` loop other data migrations here use,
    # so `alembic upgrade head --sql` can still render it offline.
    op.execute(
        """
        INSERT INTO responsibility_date_schedules (id, date_id, schedule_id, created_at)
        SELECT gen_random_uuid()::text, id, schedule_id, now()
        FROM responsibility_dates
        """
    )

    op.drop_column('responsibility_dates', 'schedule_id')


def downgrade() -> None:
    # Re-add the single FK as nullable and backfill each date from its
    # earliest attached role set. Leaving it nullable is acceptable (same
    # tradeoff as other "re-widen on downgrade" paths in this project): a
    # date with several role sets loses all but the earliest, and a date
    # attached to nothing keeps a NULL here.
    op.add_column('responsibility_dates', sa.Column('schedule_id', sa.String(), nullable=True))
    op.execute(
        """
        UPDATE responsibility_dates AS d
        SET schedule_id = (
            SELECT ds.schedule_id
            FROM responsibility_date_schedules AS ds
            WHERE ds.date_id = d.id
            ORDER BY ds.created_at ASC
            LIMIT 1
        )
        """
    )
    op.drop_table('responsibility_date_schedules')
