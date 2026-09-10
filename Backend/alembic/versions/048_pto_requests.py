"""PTO requests — self-service time-off requests (vacation, sick, holiday,
other) from the Dashboard, reviewed (approved/rejected) by an Admin/Manager.

Revision ID: 048
Revises: 047
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = '048'
down_revision = '047'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'pto_requests',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('user_id', sa.String(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('category', sa.String(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=False),
        sa.Column('end_date', sa.Date(), nullable=False),
        sa.Column('hours', sa.Numeric(6, 2), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('reviewed_by', sa.String(), sa.ForeignKey('employees.id'), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('review_notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_pto_requests_user_id', 'pto_requests', ['user_id'])
    op.create_index('ix_pto_requests_status', 'pto_requests', ['status'])


def downgrade():
    op.drop_index('ix_pto_requests_status', table_name='pto_requests')
    op.drop_index('ix_pto_requests_user_id', table_name='pto_requests')
    op.drop_table('pto_requests')
