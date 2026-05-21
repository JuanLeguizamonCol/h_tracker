"""Add must_change_password flag to employees

Revision ID: 024
Revises: 023
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = '024'
down_revision = '023'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employees', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default='true'))


def downgrade():
    op.drop_column('employees', 'must_change_password')
