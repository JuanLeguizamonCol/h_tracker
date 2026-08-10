"""Drop password auth columns from employees

Password login was replaced entirely by "Sign in with Microsoft" (Entra ID).
Drops the now-unused password_hash and must_change_password columns.

Revision ID: 030
Revises: 029
Create Date: 2026-08-10
"""
from alembic import op
import sqlalchemy as sa

revision = '030'
down_revision = '029'
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column('employees', 'password_hash')
    op.drop_column('employees', 'must_change_password')


def downgrade():
    op.add_column('employees', sa.Column('password_hash', sa.String(), nullable=True))
    op.add_column('employees', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default='true'))
