"""add omr per-page progress counters and piece_version seams-resolved ack

Revision ID: e7b1c9d3a2f4
Revises: d2f8a6c4e1b9
Create Date: 2026-08-31

B17: `omr_jobs.pages_done` / `pages_total` back the Tracks-tab "page X of Y"
readout while a paged run is in flight. `piece_versions.seams_resolved_ack`
records the single acknowledgement `POST /library/versions/{id}/publish`
carries (F16's editor gates the publish button on every OMR seam being
marked resolved client-side; the Backend can't verify that, only record it).

Chains off d2f8a6c4e1b9. Per the 2026-08-31 outage Log entry, this reaches
production only by merge to `main` — never `alembic upgrade` against prod
from a feature branch.
"""

from alembic import op
import sqlalchemy as sa


revision = "e7b1c9d3a2f4"
down_revision = "d2f8a6c4e1b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("omr_jobs", sa.Column("pages_done", sa.Integer(), nullable=True))
    op.add_column("omr_jobs", sa.Column("pages_total", sa.Integer(), nullable=True))
    op.add_column(
        "piece_versions", sa.Column("seams_resolved_ack", sa.Boolean(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("piece_versions", "seams_resolved_ack")
    op.drop_column("omr_jobs", "pages_total")
    op.drop_column("omr_jobs", "pages_done")
