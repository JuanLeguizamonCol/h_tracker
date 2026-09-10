"""PTO requests — designated approver (defaults to the requester's supervisor)
and supporting document attachments (e.g. a medical certificate for sick days).

Revision ID: 049
Revises: 048
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = '049'
down_revision = '048'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('pto_requests', sa.Column('approver_id', sa.String(), sa.ForeignKey('employees.id'), nullable=True))
    op.create_index('ix_pto_requests_approver_id', 'pto_requests', ['approver_id'])

    op.create_table(
        'pto_request_attachments',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('pto_request_id', sa.String(), sa.ForeignKey('pto_requests.id'), nullable=False),
        sa.Column('file_name', sa.String(), nullable=False),
        sa.Column('file_url', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('uploaded_by', sa.String(), sa.ForeignKey('employees.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_pto_request_attachments_pto_request_id', 'pto_request_attachments', ['pto_request_id'])


def downgrade():
    op.drop_index('ix_pto_request_attachments_pto_request_id', table_name='pto_request_attachments')
    op.drop_table('pto_request_attachments')
    op.drop_index('ix_pto_requests_approver_id', table_name='pto_requests')
    op.drop_column('pto_requests', 'approver_id')
