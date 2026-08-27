"""Per-assignment hours allocation for the Staffing panel

Adds allocation_percentage to employee_projects — how much of the employee's
time this project assignment represents (e.g. 50% split across two
projects). The assignment's time window is NOT duplicated here; it's the
project's own start_date/end_date (already existing columns), edited from the
Staffing panel and written straight back to the project record.

Revision ID: 039
Revises: 038
Create Date: 2026-08-27
"""
from alembic import op
import sqlalchemy as sa

revision = '039'
down_revision = '038'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employee_projects', sa.Column('allocation_percentage', sa.Numeric(5, 2), nullable=True))


def downgrade():
    op.drop_column('employee_projects', 'allocation_percentage')
