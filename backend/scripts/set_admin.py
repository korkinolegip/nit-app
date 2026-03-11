"""
Set or unset is_admin for a user by telegram_id.

Usage:
    python scripts/set_admin.py <telegram_id> [--unset]
"""
import asyncio
import sys

async def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/set_admin.py <telegram_id> [--unset]")
        sys.exit(1)

    telegram_id = int(sys.argv[1])
    make_admin = "--unset" not in sys.argv

    # Import app context
    import os, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

    from db.connection import async_session
    from sqlalchemy import select
    from modules.users.models import User

    async with async_session() as db:
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        if not user:
            print(f"User with telegram_id={telegram_id} not found")
            sys.exit(1)
        user.is_admin = make_admin
        await db.commit()
        status = "admin" if make_admin else "regular user"
        print(f"User {user.name} (id={user.id}, tg={telegram_id}) is now {status}")

asyncio.run(main())
