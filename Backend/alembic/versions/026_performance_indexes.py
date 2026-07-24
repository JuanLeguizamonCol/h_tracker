"""Add indexes on frequently-filtered columns (performance)

None of the core tables had indexes on their foreign keys or on the columns
used in WHERE clauses (PostgreSQL does not index FKs automatically), so every
list view and the invoice generator fell back to sequential scans. This adds
indexes covering the hot filter paths: time-entry lookups by project/user +
date range, assignment lookups, and invoice/line joins.

Index names match SQLAlchemy's default naming so a fresh create_all (which
builds them from the models via index=True / __table_args__) and a migrated DB
end up with identical schemas.

Revision ID: 026
Revises: 025
Create Date: 2026-07-24
"""
from alembic import op

revision = '026'
down_revision = '025'
branch_labels = None
depends_on = None


# (index_name, table, [columns])
INDEXES = [
    ('ix_time_entries_project_id_date', 'time_entries', ['project_id', 'date']),
    ('ix_time_entries_user_id_date', 'time_entries', ['user_id', 'date']),
    ('ix_employee_projects_user_id', 'employee_projects', ['user_id']),
    ('ix_employee_projects_project_id', 'employee_projects', ['project_id']),
    ('ix_invoice_lines_invoice_id', 'invoice_lines', ['invoice_id']),
    ('ix_invoice_time_entries_invoice_id', 'invoice_time_entries', ['invoice_id']),
    ('ix_invoice_time_entries_time_entry_id', 'invoice_time_entries', ['time_entry_id']),
    ('ix_invoices_project_id', 'invoices', ['project_id']),
    ('ix_invoices_status', 'invoices', ['status']),
    ('ix_projects_client_id', 'projects', ['client_id']),
]


def upgrade():
    for name, table, cols in INDEXES:
        op.create_index(name, table, cols, if_not_exists=True)


def downgrade():
    for name, table, _cols in reversed(INDEXES):
        op.drop_index(name, table_name=table, if_exists=True)
