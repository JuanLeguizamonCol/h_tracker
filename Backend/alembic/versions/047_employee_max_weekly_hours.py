"""Employee max weekly hours — the capacity baseline Staffing uses to convert
an "hours per project" entry into an allocation percentage (hours / max * 100)
instead of asking the admin to compute the percentage themselves. Defaults to
40 for every existing and new employee.

Revision ID: 047
Revises: 046
Create Date: 2026-09-08
"""
from alembic import op
import sqlalchemy as sa

revision = '047'
down_revision = '046'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'employees',
        sa.Column('max_weekly_hours', sa.Numeric(5, 2), nullable=False, server_default='40'),
    )


def downgrade():
    op.drop_column('employees', 'max_weekly_hours')
