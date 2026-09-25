"""055 - Fixed-fee roles (mixed hourly / fixed billing within one project)

A project role can now bill a flat fee per week / month / project per person
instead of hours x hourly rate (`project_roles.fixed_fee_period` +
`fixed_fee_amount`; NULL period = hourly, as before). The invoice line it
produces is marked with `invoice_lines.fee_period` and keeps the per-period rate
in `fee_unit_amount`; its `amount` is the fee itself (see services/fixed_fee_calc.py
and routers/invoice.py::patch_invoice). Existing roles and lines stay hourly.

Revision ID: 055
Revises: 054
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = '055'
down_revision = '054'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('project_roles', sa.Column('fixed_fee_period', sa.String(10), nullable=True))
    op.add_column('project_roles', sa.Column('fixed_fee_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column('invoice_lines', sa.Column('fee_period', sa.String(10), nullable=True))
    op.add_column('invoice_lines', sa.Column('fee_unit_amount', sa.Numeric(10, 2), nullable=True))


def downgrade():
    op.drop_column('invoice_lines', 'fee_unit_amount')
    op.drop_column('invoice_lines', 'fee_period')
    op.drop_column('project_roles', 'fixed_fee_amount')
    op.drop_column('project_roles', 'fixed_fee_period')
