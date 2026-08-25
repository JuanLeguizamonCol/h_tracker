"""Admin-uploaded signature images + auto signatory on invoices

Adds a self-service signature image (PNG) to the employee profile — used on
invoices this admin signs as the owning project's owner — and a direct FK
from Invoice to the signing employee, so the PDF's signature image is
resolved by employee record instead of fuzzy-matching a free-text name.

Revision ID: 038
Revises: 037
Create Date: 2026-08-25
"""
from alembic import op
import sqlalchemy as sa

revision = '038'
down_revision = '037'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employees', sa.Column('signature_url', sa.String(), nullable=True))
    op.add_column('employees', sa.Column('signature_file_name', sa.String(), nullable=True))
    op.add_column('invoices', sa.Column('signatory_employee_id', sa.String(), sa.ForeignKey('employees.id'), nullable=True))


def downgrade():
    op.drop_column('invoices', 'signatory_employee_id')
    op.drop_column('employees', 'signature_file_name')
    op.drop_column('employees', 'signature_url')
