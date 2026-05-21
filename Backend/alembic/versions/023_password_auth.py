"""Add password_hash to employees for local auth

Revision ID: 023
Revises: 022
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa

revision = '023'
down_revision = '022'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('employees', sa.Column('password_hash', sa.String(), nullable=True))

    # Set a default password for all existing employees so they can log in.
    # Default: Impact2026!
    try:
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
        default_hash = ctx.hash("Impact2026!")
        safe_hash = default_hash.replace("'", "''")
        op.execute(f"UPDATE employees SET password_hash = '{safe_hash}' WHERE password_hash IS NULL")
    except Exception as e:
        print(f"[023] Warning: could not set default password hashes: {e}")


def downgrade():
    op.drop_column('employees', 'password_hash')
