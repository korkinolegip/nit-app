"""add match restore count

Revision ID: a1b2c3d4e5f6
Revises: f78bb9f171af
Create Date: 2026-03-10 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f78bb9f171af'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('matches', sa.Column('user1_restore_count', sa.SmallInteger(), nullable=False, server_default='0'))
    op.add_column('matches', sa.Column('user2_restore_count', sa.SmallInteger(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('matches', 'user2_restore_count')
    op.drop_column('matches', 'user1_restore_count')
