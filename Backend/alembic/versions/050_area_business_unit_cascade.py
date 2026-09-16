"""050 - Area Category / Business Unit cascade adjustments

The New/Edit Project form now cascades Business Unit off the selected Area
Category (1:1 by name, except Office of the CFO which offers both "Office of
the CFO" and the new "SG&A" business unit). This migration:
  - Deactivates the "Other" Area Category (removed from the 027 seed — kept as
    a soft-delete, not a hard delete, so any existing project that already has
    area_category='Other' keeps its value; it just stops being selectable for
    new projects, same pattern as every other `active` flag in this table).
  - Adds "Back Office" as a Business Unit so every non-CFO Area Category has a
    matching 1:1 Business Unit (it already exists as an Area Category since
    027, but was missing from the Business Unit seed in 028).
  - Adds "SG&A" as a Business Unit, the CFO area's second option.

Idempotent: safe to re-run.

Revision ID: 050
Revises: 049
Create Date: 2026-09-15
"""
from alembic import op
import sqlalchemy as sa
import uuid

revision = '050'
down_revision = '049'
branch_labels = None
depends_on = None

NEW_BUSINESS_UNITS = [
    "Back Office",
    "SG&A",
]


def upgrade():
    conn = op.get_bind()

    conn.execute(
        sa.text(
            "UPDATE project_categories SET active = FALSE "
            "WHERE type = 'area_category' AND value = 'Other'"
        )
    )

    for value in NEW_BUSINESS_UNITS:
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
    conn.execute(
        sa.text(
            "UPDATE project_categories SET active = TRUE "
            "WHERE type = 'area_category' AND value = 'Other'"
        )
    )
    for value in NEW_BUSINESS_UNITS:
        conn.execute(
            sa.text(
                "DELETE FROM project_categories "
                "WHERE type = 'business_unit' AND value = :v"
            ),
            {"v": value},
        )
