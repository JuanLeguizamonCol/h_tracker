"""027 - seed Area Category catalog (Impact Point business areas)

Populates the `project_categories` lookup with the real Area Category options used
by the project form. Production shipped with an empty catalog because a fresh DB is
built via create_all + `alembic stamp head` (the 005 seed in upgrade() never runs),
so this migration inserts them explicitly.

Idempotent: each value is inserted only if it is not already present, so it is safe
to re-run and safe on DBs that already have some of these values.

Revision ID: 027
Revises: 026
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa
import uuid

revision = '027'
down_revision = '026'
branch_labels = None
depends_on = None

AREA_CATEGORIES = [
    "DA&I",
    "Pegasus",
    "Office of the CFO",
    "M&A",
    "Back Office",
    "Other",
]


def upgrade():
    conn = op.get_bind()
    for value in AREA_CATEGORIES:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM project_categories "
                "WHERE type = 'area_category' AND value = :v"
            ),
            {"v": value},
        ).first()
        if not exists:
            conn.execute(
                sa.text(
                    "INSERT INTO project_categories (id, type, value, active) "
                    "VALUES (:id, 'area_category', :v, TRUE)"
                ),
                {"id": str(uuid.uuid4()), "v": value},
            )


def downgrade():
    conn = op.get_bind()
    for value in AREA_CATEGORIES:
        conn.execute(
            sa.text(
                "DELETE FROM project_categories "
                "WHERE type = 'area_category' AND value = :v"
            ),
            {"v": value},
        )
