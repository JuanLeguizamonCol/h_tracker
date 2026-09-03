"""Invoice full-edit support:
  - invoices gains per-invoice "Bill To" overrides (contact/title/company/
    address/city-state-zip) so admins can fix duplicated/wrong client fields
    on a single invoice without touching the shared Client record. Null =
    fall back to the client's own fields (unchanged behavior).
  - invoice_lines gains role_id, linking a line back to the ProjectRole it
    was billed at — lets the invoice panel push a corrected rate back onto
    the project when the role had no rate assigned yet.

Revision ID: 045
Revises: 044
Create Date: 2026-09-03
"""
from alembic import op
import sqlalchemy as sa

revision = '045'
down_revision = '044'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('invoices', sa.Column('bill_to_contact', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_title', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_company', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_address', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('bill_to_city_state_zip', sa.String(), nullable=True))
    op.add_column('invoice_lines', sa.Column('role_id', sa.String(), sa.ForeignKey('project_roles.id'), nullable=True))


def downgrade():
    op.drop_column('invoice_lines', 'role_id')
    op.drop_column('invoices', 'bill_to_city_state_zip')
    op.drop_column('invoices', 'bill_to_address')
    op.drop_column('invoices', 'bill_to_company')
    op.drop_column('invoices', 'bill_to_title')
    op.drop_column('invoices', 'bill_to_contact')
