"""054 - Fixed fee periodicity (whole project / per week / per month)

A fixed-fee amount used to mean one flat fee for the whole project. It can now
also be a weekly or monthly rate: `fixed_fee_period` says which. On a project
it's the default that pre-fills New Invoice; on an invoice it's the snapshot
actually billed, with `fixed_fee_unit_amount` holding the per-week / per-month
rate and `fixed_fee_amount` (unchanged) the resulting total for the invoice's
period — see services/fixed_fee_calc.py. Existing fixed-fee projects default to
'project', so nothing changes for them; existing invoices keep NULL here.

Revision ID: 054
Revises: 053
Create Date: 2026-09-25
"""
from alembic import op
import sqlalchemy as sa

revision = '054'
down_revision = '053'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('fixed_fee_period', sa.String(10), nullable=False, server_default='project'))
    op.add_column('invoices', sa.Column('fixed_fee_period', sa.String(10), nullable=True))
    op.add_column('invoices', sa.Column('fixed_fee_unit_amount', sa.Numeric(12, 2), nullable=True))


def downgrade():
    op.drop_column('invoices', 'fixed_fee_unit_amount')
    op.drop_column('invoices', 'fixed_fee_period')
    op.drop_column('projects', 'fixed_fee_period')
