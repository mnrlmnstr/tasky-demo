from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession


async def database_is_reachable(session: AsyncSession) -> bool:
    # A refused or unresolvable connection surfaces as a raw OSError from asyncpg,
    # not wrapped by SQLAlchemy.
    try:
        await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError):
        return False
    return True
