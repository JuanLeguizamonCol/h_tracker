"""065 - Time entry delegates

Lets an admin grant one employee ("delegate") the ability to also log/edit/
delete time entries for exactly one other employee ("target") — e.g. an
assistant entering hours for someone who doesn't use the tracker directly.
Scoped to that one pairing only, unlike the manager/admin role which can log
for anyone. See models/time_entry_delegates.py.

Revision ID: 065
Revises: 064
Create Date: 2026-10-14
"""
from alembic import op
import sqlalchemy as sa

revision = '065'
down_revision = '064'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'time_entry_delegates',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('delegate_user_id', sa.String(), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('target_user_id', sa.String(), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('granted_by', sa.String(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('granted_at', sa.DateTime(), nullable=False),
        sa.Column('revoked_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_time_entry_delegates_delegate_user_id', 'time_entry_delegates', ['delegate_user_id'])
    op.create_index('ix_time_entry_delegates_target_user_id', 'time_entry_delegates', ['target_user_id'])


def downgrade():
    op.drop_index('ix_time_entry_delegates_target_user_id', table_name='time_entry_delegates')
    op.drop_index('ix_time_entry_delegates_delegate_user_id', table_name='time_entry_delegates')
    op.drop_table('time_entry_delegates')
