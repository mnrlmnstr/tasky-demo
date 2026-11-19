import asyncio
import logging

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Without a limit, a host that drops packets keeps the check waiting about a minute.
DATABASE_CHECK_TIMEOUT_SECONDS = 3.0


async def database_is_reachable(session: AsyncSession) -> bool:
    # A refused or unresolvable connection surfaces as a raw OSError from asyncpg,
    # not wrapped by SQLAlchemy.
    try:
        async with asyncio.timeout(DATABASE_CHECK_TIMEOUT_SECONDS):
            await session.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        # Only the exception type: the message of a connection error can carry the
        # database URL.
        logger.warning("database_unreachable", extra={"error_type": type(exc).__name__})
        return False
    return True
