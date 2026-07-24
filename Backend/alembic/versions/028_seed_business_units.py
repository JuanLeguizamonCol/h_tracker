"""028 - seed Business Unit catalog (Impact Point business units)

Populates the `project_categories` lookup with the Business Unit options used by
the project form. Production shipped with an empty catalog (see migration 027).

Idempotent: each value is inserted only if it is not already present.

Revision ID: 028
Revises: 027
Create Date: 2026-07-24
"""
from alembic import op
import sqlalchemy as sa
import uuid

revision = '028'
down_revision = '027'
branch_labels = None
depends_on = None

BUSINESS_UNITS = [
    "DA&I",
    "Pegasus",
    "Office of the CFO",
    "M&A",
]


def upgrade():
    conn = op.get_bind()
    for value in BUSINESS_UNITS:
        exists = conn.execute(
            sa.text(
                "SELECT 1 FROM project_categories "
                "WHERE type = 'business_unit' AND value = :v"
            ),
            {"v": value},
        ).first()
        if not exists:
            conn.execute(
                sa.text(
                    "INSERT INTO project_categories (id, type, value, active) "
                    "VALUES (:id, 'business_unit', :v, TRUE)"
                ),
                {"id": str(uuid.uuid4()), "v": value},
            )


def downgrade():
    conn = op.get_bind()
    for value in BUSINESS_UNITS:
        conn.execute(
            sa.text(
                "DELETE FROM project_categories "
                "WHERE type = 'business_unit' AND value = :v"
            ),
            {"v": value},
        )
