from pathlib import Path

from app.domain.core_runtime import load_geojson_boundaries


def load_boundaries(path: Path):
    return load_geojson_boundaries(path)
