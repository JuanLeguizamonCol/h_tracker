"""Per-role minimum hours for Managed Services projects

Moves the Managed Services minimum from a single project-level value to a
per-role setting that can be toggled on/off for each position. The project-level
`projects.managed_services_min_hours` column is kept for backward compatibility
but is no longer used by new billing.

Revision ID: 035
Revises: 034
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = '035'
down_revision = '034'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('project_roles', sa.Column('min_hours_enabled', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('project_roles', sa.Column('min_hours', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('project_roles', 'min_hours')
    op.drop_column('project_roles', 'min_hours_enabled')
