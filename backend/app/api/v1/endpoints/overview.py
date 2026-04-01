from fastapi import APIRouter

from app.services.analytics_service import get_overview as get_overview_service

router = APIRouter(tags=["Overview"])


@router.get("/overview")
def get_overview(month: str | None = None):
    return get_overview_service(month)
