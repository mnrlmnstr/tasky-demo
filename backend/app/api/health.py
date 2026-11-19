from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.errors import INTERNAL_ERROR
from app.core.database import get_session
from app.services.health import database_is_reachable

router = APIRouter(tags=["health"], responses=INTERNAL_ERROR)


@router.get("/health", summary="Check health")
async def health(
    response: Response, session: Annotated[AsyncSession, Depends(get_session)]
) -> dict[str, str]:
    """`200` with `{"status": "ok"}` when the database answers, otherwise `503` with
    `{"status": "unavailable"}`."""
    if not await database_is_reachable(session):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "unavailable"}
    return {"status": "ok"}
