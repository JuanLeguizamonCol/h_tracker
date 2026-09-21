"""052 - Managed Services minimum-hours basis (week / month / period)

`project_roles.min_hours_basis` says what a role's `min_hours` is measured
against. Existing roles were configured as a whole-period floor, so they are
migrated to 'period'; new roles default to 'week'.
`invoice_role_minimums` stores per-invoice overrides edited in the invoice's
Managed Services panel.

Revision ID: 052
Revises: 051
Create Date: 2026-09-21
"""
from alembic import op
import sqlalchemy as sa

revision = '052'
down_revision = '051'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('project_roles', sa.Column('min_hours_basis', sa.String(10), nullable=False, server_default='period'))
    op.alter_column('project_roles', 'min_hours_basis', server_default=None)
    op.create_table(
        'invoice_role_minimums',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('invoice_id', sa.String(), sa.ForeignKey('invoices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role_id', sa.String(), sa.ForeignKey('project_roles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('min_hours', sa.Numeric(10, 2), nullable=True),
        sa.Column('basis', sa.String(10), nullable=False),
        sa.UniqueConstraint('invoice_id', 'role_id', name='uq_invoice_role_minimum'),
    )


def downgrade():
    op.drop_table('invoice_role_minimums')
    op.drop_column('project_roles', 'min_hours_basis')
