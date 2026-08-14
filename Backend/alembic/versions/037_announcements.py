"""Announcements board — post updates/documents visible to all employees or
a specific subset by Employee.location

Revision ID: 037
Revises: 036
Create Date: 2026-08-14
"""
from alembic import op
import sqlalchemy as sa

revision = '037'
down_revision = '036'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'announcements',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('visibility', sa.String(), nullable=False, server_default='all'),
        sa.Column('locations', sa.String(), nullable=True),
        sa.Column('posted_by', sa.String(), sa.ForeignKey('employees.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )
    op.create_table(
        'announcement_attachments',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('announcement_id', sa.String(), sa.ForeignKey('announcements.id'), nullable=False),
        sa.Column('file_name', sa.String(), nullable=False),
        sa.Column('file_url', sa.String(), nullable=False),
        sa.Column('file_size', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
    )


def downgrade():
    op.drop_table('announcement_attachments')
    op.drop_table('announcements')
