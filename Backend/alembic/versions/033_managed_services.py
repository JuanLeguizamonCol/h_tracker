"""Managed Services projects (minimum-hours package billing)

Revision ID: 033
Revises: 032
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa

revision = '033'
down_revision = '032'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('is_managed_services', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('projects', sa.Column('managed_services_min_hours', sa.Numeric(10, 2), nullable=True))
    op.add_column('invoices', sa.Column('managed_services_min_hours', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('invoices', 'managed_services_min_hours')
    op.drop_column('projects', 'managed_services_min_hours')
    op.drop_column('projects', 'is_managed_services')
