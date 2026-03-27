from fastapi import APIRouter

from app.services.analytics_service import get_enterprise_recommendations as get_enterprise_recommendations_service

router = APIRouter(tags=["Recommendations"])


@router.get("/enterprise/recommendations")
def get_enterprise_recommendations(enterprise_id: str = "ent_archies_001"):
    return get_enterprise_recommendations_service(enterprise_id)
