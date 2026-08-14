"""Per-role additional hours (quarterly true-up) for Managed Services projects

Adds a second, independent toggle to project_roles: when a role has
additional_hours_enabled, hours logged beyond its min_hours (floor) in a given
month accrue as "additional hours" instead of being billed that month. They
accumulate across the calendar quarter and are billed as one line on the
quarter's 3rd-month invoice, at additional_hours_rate per hour.

Revision ID: 036
Revises: 035
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = '036'
down_revision = '035'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('project_roles', sa.Column('additional_hours_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('project_roles', sa.Column('additional_hours_rate', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('project_roles', 'additional_hours_rate')
    op.drop_column('project_roles', 'additional_hours_enabled')
