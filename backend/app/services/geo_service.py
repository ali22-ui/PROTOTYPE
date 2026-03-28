from app.repositories import geo_repository


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
