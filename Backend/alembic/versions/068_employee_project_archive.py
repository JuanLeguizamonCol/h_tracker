"""068 - Soft-delete staffing assignments

Removing a person from a project in the Staffing panel used to hard-delete
the EmployeeProject row, losing the role/allocation/window history. Now the
default "Remove" action just sets is_active=False (excluded from Staffing and
from every assignment listing, same as an inactive Client/Project) — the row
stays in the database. A separate "Delete permanently" action still hard-
deletes, for an assignment added by mistake.

Revision ID: 068
Revises: 067
Create Date: 2026-11-16
"""
from alembic import op
import sqlalchemy as sa

revision = '068'
down_revision = '067'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employee_projects', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade():
    op.drop_column('employee_projects', 'is_active')
