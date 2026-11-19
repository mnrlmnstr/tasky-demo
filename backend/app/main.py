from fastapi import FastAPI

from app.api import health

API_PREFIX = "/api/v1"

app = FastAPI(title="Tasky API")
app.include_router(health.router, prefix=API_PREFIX)
