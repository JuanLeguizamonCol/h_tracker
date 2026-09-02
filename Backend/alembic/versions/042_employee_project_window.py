"""Employee projects — add an optional per-assignment time window
(start_date/end_date) independent of the project's own dates.

Revision ID: 042
Revises: 041
Create Date: 2026-09-02
"""
from alembic import op
import sqlalchemy as sa

revision = '042'
down_revision = '041'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employee_projects', sa.Column('start_date', sa.Date(), nullable=True))
    op.add_column('employee_projects', sa.Column('end_date', sa.Date(), nullable=True))


def downgrade():
    op.drop_column('employee_projects', 'end_date')
    op.drop_column('employee_projects', 'start_date')
