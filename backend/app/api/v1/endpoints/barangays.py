from fastapi import APIRouter

from app.services.geo_service import (
    get_barangay_enterprises as get_barangay_enterprises_service,
    get_barangays as get_barangays_service,
    get_barangays_geojson as get_barangays_geojson_service,
)

router = APIRouter(tags=["Barangays"])


@router.get("/barangays")
def get_barangays():
    return get_barangays_service()


@router.get("/barangays/geojson")
def get_barangays_geojson():
    return get_barangays_geojson_service()


@router.get("/barangays/{barangay_name}/enterprises")
def get_barangay_enterprises(barangay_name: str):
    return get_barangay_enterprises_service(barangay_name)
