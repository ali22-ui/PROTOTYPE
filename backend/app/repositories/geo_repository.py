from pathlib import Path

from app.domain import core_runtime as core


def list_barangays() -> list[dict]:
    return core.BARANGAYS


def list_enterprises() -> list[dict]:
    return core.ENTERPRISES


def list_heatmap_points() -> list[dict]:
    return core.HEATMAP_POINTS


def load_geojson_boundaries(path: Path) -> dict:
    return core.load_geojson_boundaries(path)
