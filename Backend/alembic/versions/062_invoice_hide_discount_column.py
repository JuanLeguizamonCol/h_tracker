"""062 - Per-invoice toggle to hide the Discount column

Some clients don't want to see a Discount column on their invoice at all.
`hide_discount_column` hides it in the PDF, Excel export, and the on-screen
editor — the underlying discount data is untouched, just not displayed.

Revision ID: 062
Revises: 061
Create Date: 2026-10-13
"""
from alembic import op
import sqlalchemy as sa

revision = '062'
down_revision = '061'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('invoices', sa.Column('hide_discount_column', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column('invoices', 'hide_discount_column')
