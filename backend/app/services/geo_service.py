from app.repositories.mock_repository import get_core_module


core = get_core_module()


def get_barangays():
    return core.get_barangays()


def get_barangays_geojson():
    return core.get_barangays_geojson()


def get_barangay_enterprises(barangay_name: str):
    return core.get_barangay_enterprises(barangay_name)
