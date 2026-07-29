"""Add location field to employees

Adds a free-text `location` column to `employees`. Complements the existing
granular address fields (country/state/city) with a single grouping-friendly
label (e.g. "Bogotá HQ", "Remote — US") used by the reports grouping filter.

Revision ID: 029
Revises: 028
Create Date: 2026-07-29
"""
from alembic import op
import sqlalchemy as sa

revision = '029'
down_revision = '028'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employees', sa.Column('location', sa.String(), nullable=True))


def downgrade():
    op.drop_column('employees', 'location')
