"""Per-invoice ACH/bank detail overrides — the PDF's "ACH Instructions" box
(Bank, ABA, Account Name, Account Number) currently comes from the static
per-company profile in invoice_config.py, which is blank for Pegasus (PI).
Null falls back to that company profile, same pattern as the Bill To
overrides from migration 045.

Revision ID: 046
Revises: 045
Create Date: 2026-09-04
"""
from alembic import op
import sqlalchemy as sa

revision = '046'
down_revision = '045'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('invoices', sa.Column('bank_name', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bank_aba', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bank_account_name', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bank_account_number', sa.String(), nullable=True))


def downgrade():
    op.drop_column('invoices', 'bank_account_number')
    op.drop_column('invoices', 'bank_account_name')
    op.drop_column('invoices', 'bank_aba')
    op.drop_column('invoices', 'bank_name')
