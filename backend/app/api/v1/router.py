from fastapi import APIRouter

from app.api.v1.endpoints import barangays, camera, enterprises, health, lgu, overview, recommendations, reports

api_router = APIRouter(prefix="/api")
ws_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(overview.router)
api_router.include_router(barangays.router)
api_router.include_router(enterprises.router)
api_router.include_router(reports.router)
api_router.include_router(recommendations.router)
api_router.include_router(lgu.router)
api_router.include_router(camera.router)

ws_router.include_router(camera.ws_router)
