from pathlib import Path

from legacy_core import load_geojson_boundaries


def load_boundaries(path: Path):
    return load_geojson_boundaries(path)
