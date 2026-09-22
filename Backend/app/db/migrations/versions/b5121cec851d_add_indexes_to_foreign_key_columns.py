"""add indexes to foreign key columns

Revision ID: b5121cec851d
Revises: a3f7c2e9b4d1
Create Date: 2026-09-21 21:49:36.547807

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b5121cec851d'
down_revision = 'a3f7c2e9b4d1'
branch_labels = None
depends_on = None


# (index_name, table_name, column_name) for every FK(-like) column that had
# no index at all — Postgres doesn't auto-index FK columns the way it does
# primary keys, so every "list X for this group/user/piece" query was doing
# a sequential scan. Columns that are already the leftmost member of an
# existing composite UniqueConstraint are skipped: Postgres can use that
# composite index for a leftmost-column-only lookup too, so a dedicated
# index here would just be redundant.
INDEXES = [
    ('ix_oauth_accounts_user_id', 'oauth_accounts', 'user_id'),
    ('ix_password_reset_tokens_user_id', 'password_reset_tokens', 'user_id'),
    ('ix_group_memberships_user_id', 'group_memberships', 'user_id'),
    ('ix_pieces_owner_id', 'pieces', 'owner_id'),
    ('ix_piece_versions_piece_id', 'piece_versions', 'piece_id'),
    ('ix_piece_versions_created_by', 'piece_versions', 'created_by'),
    ('ix_piece_versions_reviewed_by', 'piece_versions', 'reviewed_by'),
    ('ix_distributions_group_id', 'distributions', 'group_id'),
    ('ix_annotations_user_id', 'annotations', 'user_id'),
    ('ix_annotations_piece_id', 'annotations', 'piece_id'),
    ('ix_annotation_shares_shared_with_user_id', 'annotation_shares', 'shared_with_user_id'),
    ('ix_piece_markup_marks_user_id', 'piece_markup_marks', 'user_id'),
    ('ix_piece_markup_marks_piece_id', 'piece_markup_marks', 'piece_id'),
    ('ix_homework_group_id', 'homework', 'group_id'),
    ('ix_homework_piece_id', 'homework', 'piece_id'),
    ('ix_homework_created_by', 'homework', 'created_by'),
    ('ix_weekly_notes_group_id', 'weekly_notes', 'group_id'),
    ('ix_weekly_notes_created_by', 'weekly_notes', 'created_by'),
    ('ix_piece_rehearsal_notes_group_id', 'piece_rehearsal_notes', 'group_id'),
    ('ix_piece_rehearsal_notes_piece_id', 'piece_rehearsal_notes', 'piece_id'),
    ('ix_piece_rehearsal_notes_created_by', 'piece_rehearsal_notes', 'created_by'),
    ('ix_piece_rehearsal_notes_source_weekly_note_id', 'piece_rehearsal_notes', 'source_weekly_note_id'),
    ('ix_group_resources_group_id', 'group_resources', 'group_id'),
    ('ix_group_resources_created_by', 'group_resources', 'created_by'),
    ('ix_responsibility_schedules_group_id', 'responsibility_schedules', 'group_id'),
    ('ix_responsibility_schedules_created_by', 'responsibility_schedules', 'created_by'),
    ('ix_responsibility_roles_schedule_id', 'responsibility_roles', 'schedule_id'),
    ('ix_responsibility_date_schedules_schedule_id', 'responsibility_date_schedules', 'schedule_id'),
    ('ix_responsibility_signups_role_id', 'responsibility_signups', 'role_id'),
    ('ix_responsibility_signups_user_id', 'responsibility_signups', 'user_id'),
    ('ix_omr_jobs_user_id', 'omr_jobs', 'user_id'),
    ('ix_omr_jobs_piece_id', 'omr_jobs', 'piece_id'),
    ('ix_carpool_events_group_id', 'carpool_events', 'group_id'),
    ('ix_carpool_events_created_by', 'carpool_events', 'created_by'),
    ('ix_carpool_posts_event_id', 'carpool_posts', 'event_id'),
    ('ix_carpool_posts_user_id', 'carpool_posts', 'user_id'),
    ('ix_carpool_seat_claims_driver_post_id', 'carpool_seat_claims', 'driver_post_id'),
    ('ix_carpool_seat_claims_user_id', 'carpool_seat_claims', 'user_id'),
    ('ix_carpool_rider_interests_rider_post_id', 'carpool_rider_interests', 'rider_post_id'),
    ('ix_carpool_rider_interests_user_id', 'carpool_rider_interests', 'user_id'),
]


def upgrade() -> None:
    for index_name, table_name, column_name in INDEXES:
        op.create_index(index_name, table_name, [column_name])


def downgrade() -> None:
    for index_name, table_name, _column_name in reversed(INDEXES):
        op.drop_index(index_name, table_name=table_name)
