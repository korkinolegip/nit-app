"""add template_id to post_tests

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-11 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('post_tests', sa.Column(
        'template_id', sa.Integer(),
        sa.ForeignKey('test_templates.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.create_index('idx_post_tests_template_id', 'post_tests', ['template_id'])


def downgrade() -> None:
    op.drop_index('idx_post_tests_template_id', table_name='post_tests')
    op.drop_column('post_tests', 'template_id')
