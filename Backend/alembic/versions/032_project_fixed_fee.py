"""Fixed-fee projects

Allows a project to be marked as fixed-fee: instead of billing hours x rate,
the invoice charges a single flat fee, and only hours are shown (for
reference/tracking) in the invoicing screen.

Revision ID: 032
Revises: 031
Create Date: 2026-08-11
"""
from alembic import op
import sqlalchemy as sa

revision = '032'
down_revision = '031'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('projects', sa.Column('is_fixed_fee', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('projects', sa.Column('fixed_fee_amount', sa.Numeric(10, 2), nullable=True))
    op.add_column('invoices', sa.Column('fixed_fee_amount', sa.Numeric(12, 2), nullable=True))


def downgrade():
    op.drop_column('invoices', 'fixed_fee_amount')
    op.drop_column('projects', 'fixed_fee_amount')
    op.drop_column('projects', 'is_fixed_fee')
