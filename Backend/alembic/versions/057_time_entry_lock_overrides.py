"""057 - Temporary admin-granted exceptions to the monthly time-entry close

`time_entry_lock_overrides` lets an Admin grant one specific employee a
2-hour window to log/edit/delete time entries in an already-closed month
(see utils/time_entry_lock.py) — a controlled, audited, time-boxed exception
instead of the lock having zero way around it for anyone. No rows are seeded;
an empty table means the lock still applies to everyone exactly as today.

Revision ID: 057
Revises: 056
Create Date: 2026-10-06
"""
from alembic import op
import sqlalchemy as sa

revision = '057'
down_revision = '056'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'time_entry_lock_overrides',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('employee_id', sa.String(), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('granted_by', sa.String(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('granted_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_time_entry_lock_overrides_employee_id', 'time_entry_lock_overrides', ['employee_id'])


def downgrade():
    op.drop_index('ix_time_entry_lock_overrides_employee_id', table_name='time_entry_lock_overrides')
    op.drop_table('time_entry_lock_overrides')
