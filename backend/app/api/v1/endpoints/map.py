from fastapi import APIRouter

from app.services.geo_service import get_map_boundaries as get_map_boundaries_service

router = APIRouter(tags=["Map"])


@router.get("/map/boundaries")
def get_map_boundaries():
    return get_map_boundaries_service()
