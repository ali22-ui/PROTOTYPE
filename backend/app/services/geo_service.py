import json
from pathlib import Path

from app.repositories import geo_repository


BOUNDARIES_GEOJSON_PATH = Path(__file__).resolve().parents[2] / "data" / "gis" / "san_pedro_boundaries.geojson"


def get_barangays():
    enterprises = geo_repository.list_enterprises()
    barangays = geo_repository.list_barangays()

    enterprise_count: dict[str, int] = {}
    for enterprise in enterprises:
        key = enterprise["barangay"].lower()
        enterprise_count[key] = enterprise_count.get(key, 0) + 1

    enriched_barangays = []
    for barangay in barangays:
        enriched_barangays.append(
            {
                **barangay,
                "enterpriseCount": enterprise_count.get(barangay["name"].lower(), 0),
            }
        )

    return {
        "barangays": enriched_barangays,
        "heatmap": geo_repository.list_heatmap_points(),
    }


def get_barangays_geojson():
    features = []
    for barangay in geo_repository.list_barangays():
        ring = [[point["lng"], point["lat"]] for point in barangay["coordinates"]]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "name": barangay["name"],
                    "id": barangay["id"],
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [ring],
                },
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def get_map_boundaries():
    path = BOUNDARIES_GEOJSON_PATH

    if path.exists():
        try:
            with path.open("r", encoding="utf-8") as handle:
                payload = json.load(handle)

            features = payload.get("features")
            if payload.get("type") == "FeatureCollection" and isinstance(features, list) and features:
                filtered_features = []

                for feature in features:
                    if not isinstance(feature, dict):
                        continue

                    geometry = feature.get("geometry") or {}
                    properties = feature.get("properties") or {}

                    if not isinstance(geometry, dict) or not isinstance(properties, dict):
                        continue

                    geometry_type = geometry.get("type")
                    coordinates = geometry.get("coordinates")
                    if geometry_type not in {"Polygon", "MultiPolygon"}:
                        continue
                    if not isinstance(coordinates, list) or not coordinates:
                        continue

                    # Keep only official barangay/admin boundary features.
                    if properties.get("boundary") != "administrative":
                        continue

                    name = properties.get("name")
                    if not isinstance(name, str) or not name.strip():
                        continue

                    feature_id = (
                        properties.get("id")
                        or properties.get("@id")
                        or feature.get("id")
                        or name.lower().replace(" ", "-")
                    )

                    filtered_features.append(
                        {
                            "type": "Feature",
                            "properties": {
                                **properties,
                                "id": str(feature_id),
                                "name": name,
                            },
                            "geometry": {
                                "type": geometry_type,
                                "coordinates": coordinates,
                            },
                        }
                    )

                if filtered_features:
                    return {
                        "type": "FeatureCollection",
                        "features": filtered_features,
                    }
        except (OSError, json.JSONDecodeError):
            pass

    return get_barangays_geojson()


def get_barangay_enterprises(barangay_name: str):
    matches = [
        enterprise
        for enterprise in geo_repository.list_enterprises()
        if enterprise["barangay"].lower() == barangay_name.lower()
    ]
    return {
        "barangay": barangay_name,
        "enterprises": matches,
    }
