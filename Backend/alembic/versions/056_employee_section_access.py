"""056 - Per-employee, per-section access overrides

`employee_section_access` lets an Admin grant or revoke View/Edit for one
employee on one section (Projects, Clients, Employees, Staffing, Invoices,
Reports, Weekly Log, History, My Profile, Dashboard) without changing their
base role (employee/manager/admin), which would affect everyone sharing it.
No rows are seeded here — an empty table means every employee keeps exactly
the access their role already gives them (see utils/section_access.py for the
per-section role defaults); overrides are created later from the Employees
panel.

Revision ID: 056
Revises: 055
Create Date: 2026-09-30
"""
from alembic import op
import sqlalchemy as sa

revision = '056'
down_revision = '055'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'employee_section_access',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('employee_id', sa.String(), sa.ForeignKey('employees.id', ondelete='CASCADE'), nullable=False),
        sa.Column('section', sa.String(), nullable=False),
        sa.Column('can_view', sa.Boolean(), nullable=True),
        sa.Column('can_edit', sa.Boolean(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('updated_by', sa.String(), sa.ForeignKey('employees.id'), nullable=True),
        sa.UniqueConstraint('employee_id', 'section', name='uq_employee_section_access'),
    )
    op.create_index('ix_employee_section_access_employee_id', 'employee_section_access', ['employee_id'])


def downgrade():
    op.drop_index('ix_employee_section_access_employee_id', table_name='employee_section_access')
    op.drop_table('employee_section_access')
