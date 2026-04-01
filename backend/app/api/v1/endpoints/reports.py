from fastapi import APIRouter

from app.services.analytics_service import get_logs as get_logs_service
from app.services.analytics_service import get_reports as get_reports_service

router = APIRouter(tags=["Reports"])


@router.get("/reports")
def get_reports(month: str | None = None):
    return get_reports_service(month)


@router.get("/logs")
def get_logs():
    return get_logs_service()
