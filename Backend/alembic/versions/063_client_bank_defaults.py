"""063 - Default ACH/bank instructions per client

Lets a client's invoices default to their own banking instructions instead
of always falling back to the owner company's generic profile — set once
(from the Client panel or from any of their invoices, see patch_invoice) and
every invoice for them picks it up automatically.

Revision ID: 063
Revises: 062
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = '063'
down_revision = '062'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('clients', sa.Column('bank_name', sa.String(), nullable=True))
    op.add_column('clients', sa.Column('bank_aba', sa.String(), nullable=True))
    op.add_column('clients', sa.Column('bank_account_name', sa.String(), nullable=True))
    op.add_column('clients', sa.Column('bank_account_number', sa.String(), nullable=True))


def downgrade():
    op.drop_column('clients', 'bank_name')
    op.drop_column('clients', 'bank_aba')
    op.drop_column('clients', 'bank_account_name')
    op.drop_column('clients', 'bank_account_number')
