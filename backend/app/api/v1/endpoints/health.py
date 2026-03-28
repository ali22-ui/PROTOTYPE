from fastapi import APIRouter

from app.schemas.common import HealthResponse
from app.services.analytics_service import health_check as health_check_service

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthResponse)
def health_check():
    return health_check_service()
