from datetime import datetime
import asyncio
import io
import json
import random
import re
import zipfile
from typing import Dict, Set
from pathlib import Path
from fastapi import Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

from domain_exceptions import DomainConflictError, DomainForbiddenError, DomainNotFoundError


BASE_DIR = Path(__file__).resolve().parents[2]
BOUNDARY_GEOJSON_PATH = BASE_DIR / "data" / "san_pedro_barangays.geojson"

OVERVIEW = {
    "city": "San Pedro City, Laguna",
    "zip": "4023",
    "date": datetime.now().strftime("%A, %B %d, %Y"),
    "metrics": {
        "totalPeopleToday": 1540,
        "totalVisitors": 820,
        "totalTourists": 320,
        "currentlyInside": 105,
    },
    "sparkline": {
        "totalPeopleToday": [1200, 1260, 1320, 1380, 1450, 1510, 1540],
        "totalVisitors": [650, 670, 700, 740, 780, 805, 820],
        "totalTourists": [210, 225, 240, 270, 285, 300, 320],
        "currentlyInside": [80, 92, 88, 110, 115, 108, 105],
    },
    "recentActivities": [
        "5 new business reports submitted",
        "2 barangays reached peak visitor density",
        "San Antonio traffic advisory issued",
        "3 enterprise audits completed",
    ],
    "peakHour": [
        {"time": "9 AM", "value": 45},
        {"time": "10 AM", "value": 58},
        {"time": "11 AM", "value": 73},
        {"time": "12 PM", "value": 88},
        {"time": "1 PM", "value": 94},
        {"time": "2 PM", "value": 84},
        {"time": "3 PM", "value": 79},
        {"time": "4 PM", "value": 72},
        {"time": "5 PM", "value": 61},
        {"time": "6 PM", "value": 50},
    ],
}

BARANGAY_CENTERS = [
    {"id": "bagong-silang", "name": "Bagong Silang", "center": {"lat": 14.3484, "lng": 121.0435}},
    {"id": "calendola", "name": "Calendola", "center": {"lat": 14.3478, "lng": 121.0378}},
    {"id": "chrysanthemum", "name": "Chrysanthemum", "center": {"lat": 14.3512, "lng": 121.0505}},
    {"id": "cuyab", "name": "Cuyab", "center": {"lat": 14.3746, "lng": 121.0571}},
    {"id": "estrella", "name": "Estrella", "center": {"lat": 14.3456, "lng": 121.0331}},
    {"id": "fatima", "name": "Fatima", "center": {"lat": 14.3601, "lng": 121.0515}},
    {"id": "gsis", "name": "G.S.I.S.", "center": {"lat": 14.3572, "lng": 121.0428}},
    {"id": "landayan", "name": "Landayan", "center": {"lat": 14.3521, "lng": 121.0676}},
    {"id": "langgam", "name": "Langgam", "center": {"lat": 14.3364, "lng": 121.0267}},
    {"id": "laram", "name": "Laram", "center": {"lat": 14.3379, "lng": 121.0343}},
    {"id": "magsaysay", "name": "Magsaysay", "center": {"lat": 14.3498, "lng": 121.0365}},
    {"id": "maharlika", "name": "Maharlika", "center": {"lat": 14.3465, "lng": 121.0457}},
    {"id": "narra", "name": "Narra", "center": {"lat": 14.3392, "lng": 121.0361}},
    {"id": "nueva", "name": "Nueva", "center": {"lat": 14.3583, "lng": 121.0576}},
    {"id": "pacita-1", "name": "Pacita I", "center": {"lat": 14.3453, "lng": 121.0565}},
    {"id": "pacita-2", "name": "Pacita II", "center": {"lat": 14.3498, "lng": 121.0482}},
    {"id": "poblacion", "name": "Poblacion", "center": {"lat": 14.3619, "lng": 121.0581}},
    {"id": "riverside", "name": "Riverside", "center": {"lat": 14.3442, "lng": 121.0392}},
    {"id": "rosario", "name": "Rosario", "center": {"lat": 14.3481, "lng": 121.0532}},
    {"id": "sampaguita", "name": "Sampaguita Village", "center": {"lat": 14.3542, "lng": 121.0385}},
    {"id": "san-antonio", "name": "San Antonio", "center": {"lat": 14.3669, "lng": 121.0562}},
    {"id": "san-lorenzo-ruiz", "name": "San Lorenzo Ruiz", "center": {"lat": 14.3525, "lng": 121.0494}},
    {"id": "san-roque", "name": "San Roque", "center": {"lat": 14.3672, "lng": 121.0621}},
    {"id": "san-vicente", "name": "San Vicente", "center": {"lat": 14.3574, "lng": 121.0483}},
    {"id": "santo-nino", "name": "Santo Niño", "center": {"lat": 14.3698, "lng": 121.0568}},
    {"id": "united-bayanihan", "name": "United Bayanihan", "center": {"lat": 14.3445, "lng": 121.0415}},
    {"id": "united-better-living", "name": "United Better Living", "center": {"lat": 14.3491, "lng": 121.0312}},
]


def build_polygon(lat: float, lng: float, i: int):
    lat_size = 0.0038 + ((i % 3) * 0.0005)
    lng_size = 0.0054 + ((i % 4) * 0.0006)
    return [
        {"lat": lat + lat_size, "lng": lng - lng_size},
        {"lat": lat + lat_size * 0.3, "lng": lng + lng_size},
        {"lat": lat - lat_size, "lng": lng + lng_size * 0.85},
        {"lat": lat - lat_size * 0.5, "lng": lng - lng_size},
    ]


def normalize_barangay_name(name: str):
    cleaned = (
        name.lower()
        .replace(".", "")
        .replace("-", " ")
        .replace("ñ", "n")
        .replace("village", "")
        .replace("  ", " ")
        .strip()
    )

    alias_map = {
        "pacita 1": "pacita i",
        "pacita ii": "pacita ii",
        "pacita 2": "pacita ii",
        "gsis": "gsis",
        "sto nino": "santo nino",
        "santo niño": "santo nino",
        "san lorenzo ruiz": "san lorenzo ruiz",
        "sampaguita": "sampaguita",
        "sampaguita village": "sampaguita",
    }

    return alias_map.get(cleaned, cleaned)


def geojson_ring_to_paths(ring):
    return [{"lat": lat, "lng": lng} for lng, lat in ring]


def load_geojson_boundaries(path: Path):
    if not path.exists():
        return {}

    try:
        with path.open("r", encoding="utf-8") as f:
            feature_collection = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}

    features = feature_collection.get("features", [])
    by_name = {}
    for feature in features:
        props = feature.get("properties", {})
        geometry = feature.get("geometry", {})
        name = props.get("name") or props.get("barangay") or props.get("BARANGAY")
        if not name:
            continue

        geometry_type = geometry.get("type")
        coordinates = geometry.get("coordinates", [])
        if not coordinates:
            continue

        # Keep the outermost ring for display simplicity in this prototype.
        if geometry_type == "Polygon":
            ring = coordinates[0]
        elif geometry_type == "MultiPolygon":
            ring = coordinates[0][0]
        else:
            continue

        if len(ring) < 3:
            continue

        norm = normalize_barangay_name(name)
        by_name[norm] = geojson_ring_to_paths(ring)

    return by_name


BARANGAYS = []
for idx, entry in enumerate(BARANGAY_CENTERS):
    BARANGAYS.append(
        {
            "id": entry["id"],
            "name": entry["name"],
            "center": entry["center"],
            "coordinates": build_polygon(entry["center"]["lat"], entry["center"]["lng"], idx),
        }
    )

# Override synthetic polygons when official GeoJSON boundaries are available.
geojson_boundaries = load_geojson_boundaries(BOUNDARY_GEOJSON_PATH)
if geojson_boundaries:
    for barangay in BARANGAYS:
        key = normalize_barangay_name(barangay["name"])
        polygon = geojson_boundaries.get(key)
        if not polygon:
            continue

        barangay["coordinates"] = polygon
        # Recompute visual center from boundary coordinates.
        lat_sum = sum(point["lat"] for point in polygon)
        lng_sum = sum(point["lng"] for point in polygon)
        barangay["center"] = {
            "lat": lat_sum / len(polygon),
            "lng": lng_sum / len(polygon),
        }


HEATMAP_BASE_WEIGHTS = {
    "San Antonio": 9,
    "Landayan": 8,
    "Pacita I": 8,
    "Pacita II": 7,
    "San Vicente": 7,
    "Poblacion": 7,
    "Langgam": 8,
    "Nueva": 6,
    "Fatima": 6,
    "Calendola": 6,
}


HEATMAP_POINTS = []
for barangay in BARANGAYS:
    center = barangay["center"]
    base_weight = HEATMAP_BASE_WEIGHTS.get(barangay["name"], 5)

    # Dense local cluster to create smooth heatmap blobs per barangay.
    cluster_offsets = [
        (0.0, 0.0, 0),
        (0.00028, -0.00022, -1),
        (-0.00026, 0.00024, -1),
        (0.00018, 0.00025, -2),
        (-0.00021, -0.00018, -2),
        (0.00036, 0.00005, -2),
        (-0.00005, -0.00034, -2),
    ]

    for lat_off, lng_off, weight_off in cluster_offsets:
        HEATMAP_POINTS.append(
            {
                "lat": center["lat"] + lat_off,
                "lng": center["lng"] + lng_off,
                "weight": max(3, base_weight + weight_off),
            }
        )

ENTERPRISES = [
    {
        "id": 1,
        "name": "Jollibee - Pacita",
        "barangay": "San Antonio",
        "type": "Food",
        "status": "Active",
        "businessId": "LGU-BIZ-0001",
    },
    {
        "id": 2,
        "name": "San Pedro Public Market",
        "barangay": "San Antonio",
        "type": "Market",
        "status": "Active",
        "businessId": "LGU-BIZ-0002",
    },
    {
        "id": 3,
        "name": "Pacita Commercial Center",
        "barangay": "Pacita 1",
        "type": "Retail",
        "status": "Active",
        "businessId": "LGU-BIZ-0003",
    },
    {
        "id": 4,
        "name": "Landayan Food Park",
        "barangay": "Landayan",
        "type": "Food",
        "status": "Under Review",
        "businessId": "LGU-BIZ-0004",
    },
    {
        "id": 5,
        "name": "Pacita Fresh Mart",
        "barangay": "Pacita 2",
        "type": "Retail",
        "status": "Active",
        "businessId": "LGU-BIZ-0005",
    },
    {
        "id": 6,
        "name": "United Bayanihan Pharmacy",
        "barangay": "United Bayanihan",
        "type": "Health",
        "status": "Active",
        "businessId": "LGU-BIZ-0006",
    },
    {
        "id": 7,
        "name": "San Vicente Hardware",
        "barangay": "San Vicente",
        "type": "Hardware",
        "status": "Active",
        "businessId": "LGU-BIZ-0007",
    },
    {
        "id": 8,
        "name": "Guevara Garden Cafe",
        "barangay": "Guevara",
        "type": "Food",
        "status": "Active",
        "businessId": "LGU-BIZ-0008",
    },
    {
        "id": 9,
        "name": "San Antonio Medical Clinic",
        "barangay": "San Antonio",
        "type": "Health",
        "status": "Active",
        "businessId": "LGU-BIZ-0009",
    },
    {
        "id": 10,
        "name": "Landayan Agro Supplies",
        "barangay": "Landayan",
        "type": "Agriculture",
        "status": "Active",
        "businessId": "LGU-BIZ-0010",
    },
    {
        "id": 11,
        "name": "Pacita Transport Hub",
        "barangay": "Pacita 1",
        "type": "Transport",
        "status": "Active",
        "businessId": "LGU-BIZ-0011",
    },
    {
        "id": 12,
        "name": "San Vicente Learning Center",
        "barangay": "San Vicente",
        "type": "Education",
        "status": "Under Review",
        "businessId": "LGU-BIZ-0012",
    },
    {
        "id": 13,
        "name": "Guevara Builders Depot",
        "barangay": "Guevara",
        "type": "Hardware",
        "status": "Active",
        "businessId": "LGU-BIZ-0013",
    },
    {
        "id": 14,
        "name": "United Bayanihan Laundry",
        "barangay": "United Bayanihan",
        "type": "Services",
        "status": "Active",
        "businessId": "LGU-BIZ-0014",
    },
    {
        "id": 15,
        "name": "Pacita 2 Food Terminal",
        "barangay": "Pacita 2",
        "type": "Food",
        "status": "Active",
        "businessId": "LGU-BIZ-0015",
    },
    {
        "id": 16,
        "name": "San Antonio Innovation Hub",
        "barangay": "San Antonio",
        "type": "Technology",
        "status": "Pending Renewal",
        "businessId": "LGU-BIZ-0016",
    },
    {
        "id": 17,
        "name": "Landayan Riverside Eatery",
        "barangay": "Landayan",
        "type": "Food",
        "status": "Active",
        "businessId": "LGU-BIZ-0017",
    },
    {
        "id": 18,
        "name": "Pacita Community Bank",
        "barangay": "Pacita 1",
        "type": "Finance",
        "status": "Active",
        "businessId": "LGU-BIZ-0018",
    },
    {
        "id": 19,
        "name": "San Vicente Town Grocer",
        "barangay": "San Vicente",
        "type": "Retail",
        "status": "Active",
        "businessId": "LGU-BIZ-0019",
    },
    {
        "id": 20,
        "name": "Guevara Logistics Point",
        "barangay": "Guevara",
        "type": "Logistics",
        "status": "Active",
        "businessId": "LGU-BIZ-0020",
    },
]

ENTERPRISE_EXPANSION = {
    "Pacita 1": [
        ("Pacita Wellness Center", "Health"),
        ("Pacita South Water Refill", "Services"),
        ("Pacita One Mart", "Retail"),
        ("Pacita Bakeshop", "Food"),
        ("Pacita Appliance Hub", "Retail"),
    ],
    "Pacita 2": [
        ("Pacita 2 Meat Depot", "Food"),
        ("Pacita 2 Internet Cafe", "Technology"),
        ("Pacita 2 Veterinary Clinic", "Health"),
        ("Pacita 2 Mini Grocery", "Retail"),
        ("Pacita 2 Service Station", "Transport"),
    ],
    "San Antonio": [
        ("San Antonio Dental Care", "Health"),
        ("San Antonio Auto Supply", "Hardware"),
        ("San Antonio Quickmart", "Retail"),
        ("San Antonio Printing Services", "Services"),
        ("San Antonio Study Hub", "Education"),
    ],
    "San Vicente": [
        ("San Vicente Rice Trading", "Agriculture"),
        ("San Vicente Drugstore", "Health"),
        ("San Vicente Fuel Center", "Transport"),
        ("San Vicente Home Essentials", "Retail"),
        ("San Vicente Cyber Cafe", "Technology"),
    ],
    "United Bayanihan": [
        ("Bayanihan Community Mart", "Retail"),
        ("Bayanihan Bake House", "Food"),
        ("Bayanihan Med Supply", "Health"),
        ("Bayanihan Repair Shop", "Services"),
        ("Bayanihan Learning Hub", "Education"),
    ],
    "Landayan": [
        ("Landayan Marina Eatery", "Food"),
        ("Landayan Builders Supply", "Hardware"),
        ("Landayan Fresh Catch", "Market"),
        ("Landayan Family Clinic", "Health"),
        ("Landayan Logistics Yard", "Logistics"),
    ],
    "Guevara": [
        ("Guevara Public Pharmacy", "Health"),
        ("Guevara City Mart", "Retail"),
        ("Guevara Transport Services", "Transport"),
        ("Guevara Tech Repairs", "Technology"),
        ("Guevara Food Plaza", "Food"),
    ],
}


def build_enterprise_registry(seed_data):
    registry = seed_data.copy()
    next_id = max(entry["id"] for entry in registry) + 1

    status_cycle = ["Active", "Active", "Active", "Under Review", "Pending Renewal"]

    for barangay, entries in ENTERPRISE_EXPANSION.items():
        for index, (name, biz_type) in enumerate(entries):
            registry.append(
                {
                    "id": next_id,
                    "name": name,
                    "barangay": barangay,
                    "type": biz_type,
                    "status": status_cycle[index % len(status_cycle)],
                    "businessId": f"LGU-BIZ-{next_id:04d}",
                }
            )
            next_id += 1

    return registry


ENTERPRISES = build_enterprise_registry(ENTERPRISES)


def normalize_enterprise_barangays(registry):
    valid_names = {barangay["name"] for barangay in BARANGAYS}
    alias_map = {
        "Guevara": "Maharlika",
        "Pacita 2": "Pacita II",
        "Pacita 1": "Pacita I",
        "Pacita II": "Pacita II",
        "Pacita I": "Pacita I",
        "United Bayanihan": "United Bayanihan",
    }

    for enterprise in registry:
        if enterprise["barangay"] not in valid_names:
            enterprise["barangay"] = alias_map.get(enterprise["barangay"], "Poblacion")

    return registry


def ensure_barangay_coverage(registry):
    covered = {enterprise["barangay"] for enterprise in registry}
    next_id = max(entry["id"] for entry in registry) + 1

    for barangay in BARANGAYS:
        if barangay["name"] in covered:
            continue

        registry.append(
            {
                "id": next_id,
                "name": f"{barangay['name']} Community Store",
                "barangay": barangay["name"],
                "type": "Retail",
                "status": "Active",
                "businessId": f"LGU-BIZ-{next_id:04d}",
            }
        )
        next_id += 1

    return registry


ENTERPRISES = normalize_enterprise_barangays(ENTERPRISES)
ENTERPRISES = ensure_barangay_coverage(ENTERPRISES)

ENTERPRISE_ANALYTICS = {
    1: {
        "demographics": [
            {"name": "Male", "value": 62},
            {"name": "Female", "value": 38},
        ],
        "residency": [
            {"name": "Residents", "value": 72},
            {"name": "Non-Residents", "value": 20},
            {"name": "Foreign Tourists", "value": 8},
        ],
        "visitorTrends": [
            {"month": "Jan", "visitors": 420},
            {"month": "Feb", "visitors": 465},
            {"month": "Mar", "visitors": 510},
            {"month": "Apr", "visitors": 548},
            {"month": "May", "visitors": 590},
            {"month": "Jun", "visitors": 610},
        ],
        "reportHistory": [
            {"date": "2026-01-12", "type": "Monthly Foot Traffic", "status": "Submitted"},
            {"date": "2026-02-11", "type": "Health Compliance", "status": "Approved"},
            {"date": "2026-03-10", "type": "Quarterly Demographics", "status": "Pending"},
        ],
    },
    2: {
        "demographics": [
            {"name": "Male", "value": 55},
            {"name": "Female", "value": 45},
        ],
        "residency": [
            {"name": "Residents", "value": 76},
            {"name": "Non-Residents", "value": 18},
            {"name": "Foreign Tourists", "value": 6},
        ],
        "visitorTrends": [
            {"month": "Jan", "visitors": 310},
            {"month": "Feb", "visitors": 340},
            {"month": "Mar", "visitors": 360},
            {"month": "Apr", "visitors": 390},
            {"month": "May", "visitors": 420},
            {"month": "Jun", "visitors": 450},
        ],
        "reportHistory": [
            {"date": "2026-01-15", "type": "Monthly Foot Traffic", "status": "Submitted"},
            {"date": "2026-02-16", "type": "Sanitation Audit", "status": "Approved"},
            {"date": "2026-03-17", "type": "Quarterly Demographics", "status": "Submitted"},
        ],
    },
}

REPORTS = {
    "quarterlyVisitorDemographics": [
        {"name": "Male Residents", "value": 430},
        {"name": "Female Residents", "value": 390},
        {"name": "Male Tourists", "value": 170},
        {"name": "Female Tourists", "value": 150},
    ],
    "submittedReports": [
        {
            "id": "RPT-1023",
            "business": "Jollibee - Pacita",
            "status": "Approved",
            "type": "Quarterly Demographics",
            "submittedBy": "Maria C. Santos",
            "submittedAt": "2026-03-10 10:40",
            "summary": "Visitor mix remained stable with 8% increase in non-residents.",
        },
        {
            "id": "RPT-1024",
            "business": "San Pedro Public Market",
            "status": "Pending",
            "type": "Monthly Foot Traffic",
            "submittedBy": "Juan Dela Cruz",
            "submittedAt": "2026-03-12 14:12",
            "summary": "Foot traffic spiked near noon due to local trade fair.",
        },
        {
            "id": "RPT-1025",
            "business": "Landayan Food Park",
            "status": "Rejected",
            "type": "Compliance Check",
            "submittedBy": "Anna L. Rivera",
            "submittedAt": "2026-03-13 09:01",
            "summary": "Rejected due to incomplete sanitation evidence attachment.",
        },
        {
            "id": "RPT-1026",
            "business": "Pacita Commercial Center",
            "status": "Approved",
            "type": "Quarterly Demographics",
            "submittedBy": "Roberto M. Reyes",
            "submittedAt": "2026-03-15 16:23",
            "summary": "Tourist visits increased by 12% compared with previous quarter.",
        },
        {
            "id": "RPT-1027",
            "business": "Guevara Food Plaza",
            "status": "Pending",
            "type": "Incident Report",
            "submittedBy": "Clara P. Mendoza",
            "submittedAt": "2026-03-16 11:08",
            "summary": "Minor queue congestion reported near evening rush hours.",
        },
    ],
}

LOGS = [
    {
        "id": "LOG-4001",
        "timestamp": "2026-03-26 08:10",
        "source": "System",
        "category": "Data Sync",
        "message": "Barangay activity feed synchronized successfully.",
        "severity": "Info",
    },
    {
        "id": "LOG-4002",
        "timestamp": "2026-03-26 08:27",
        "source": "LGU Admin",
        "category": "Reports",
        "message": "Quarterly demographics report approved.",
        "severity": "Info",
    },
    {
        "id": "LOG-4003",
        "timestamp": "2026-03-26 09:01",
        "source": "Map Engine",
        "category": "Map",
        "message": "Heatmap tiles refreshed for San Pedro City (4023).",
        "severity": "Info",
    },
    {
        "id": "LOG-4004",
        "timestamp": "2026-03-26 09:21",
        "source": "Compliance Bot",
        "category": "Enterprise",
        "message": "2 establishments marked for permit renewal review.",
        "severity": "Warning",
    },
    {
        "id": "LOG-4005",
        "timestamp": "2026-03-26 09:45",
        "source": "System",
        "category": "Security",
        "message": "Unsuccessful sign-in attempt detected and logged.",
        "severity": "Warning",
    },
]


ARCHIES_ENTERPRISE_PROFILE = {
    "enterprise_id": "ent_archies_001",
    "company_name": "Archies",
    "dashboard_title": "Archies Enterprise Dashboard - Tourism Analytics Portal",
    "logo_url": "https://placehold.co/96x96/png",
    "linked_lgu_id": "lgu_san_pedro_001",
    "reporting_window_status": "CLOSED",
    "timezone": "PST",
    "cameras": [
        {
            "camera_id": "cam_main_entrance_01",
            "name": "Main Entrance - Camera 1",
            "status": "ACTIVE",
        }
    ],
}


THEME_PRESETS = [
    {"sidebar": "#0f172a", "accent": "#1d4ed8", "surface": "#f8fafc"},
    {"sidebar": "#111827", "accent": "#7c3aed", "surface": "#f8fafc"},
    {"sidebar": "#1f2937", "accent": "#059669", "surface": "#f8fafc"},
    {"sidebar": "#172554", "accent": "#ea580c", "surface": "#f8fafc"},
    {"sidebar": "#0c4a6e", "accent": "#0ea5e9", "surface": "#f8fafc"},
]


def to_enterprise_id(name: str, fallback_id: str):
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "_", name).strip("_").lower()
    if not cleaned:
        cleaned = fallback_id
    return f"ent_{cleaned}"


def camera_name_for_type(business_type: str):
    mapping = {
        "Food": "Dining Entrance - Camera 1",
        "Market": "Main Aisle - Camera 1",
        "Retail": "Storefront - Camera 1",
        "Health": "Reception Area - Camera 1",
        "Technology": "Service Desk - Camera 1",
        "Transport": "Terminal Gate - Camera 1",
        "Education": "Learning Hall - Camera 1",
        "Finance": "Customer Hall - Camera 1",
        "Logistics": "Loading Bay - Camera 1",
        "Hardware": "Materials Counter - Camera 1",
        "Agriculture": "Supply Counter - Camera 1",
        "Services": "Service Lobby - Camera 1",
    }
    return mapping.get(business_type, "Main Entrance - Camera 1")


def build_enterprise_catalog():
    catalog = [
        {
            "enterprise_id": "ent_archies_001",
            "company_name": "Archies",
            "linked_lgu_id": "lgu_san_pedro_001",
            "business_type": "Tourism",
            "barangay": "Poblacion",
        }
    ]

    for item in ENTERPRISES:
        enterprise_id = to_enterprise_id(item.get("businessId", "biz_0000"), f"biz_{item['id']}")
        if any(existing["enterprise_id"] == enterprise_id for existing in catalog):
            continue
        catalog.append(
            {
                "enterprise_id": enterprise_id,
                "company_name": item["name"],
                "linked_lgu_id": "lgu_san_pedro_001",
                "business_type": item.get("type", "General"),
                "barangay": item.get("barangay", "Unassigned"),
            }
        )

    return catalog


ENTERPRISE_ACCOUNTS = build_enterprise_catalog()

LEGACY_ENTERPRISE_ID_MAP = {
    "ent_pacita_center_002": "ent_lgu_biz_0003",
    "ent_landayan_foodpark_003": "ent_lgu_biz_0004",
    "ent_sanvicente_hardware_004": "ent_lgu_biz_0007",
}


def resolve_enterprise_id(enterprise_id: str):
    return LEGACY_ENTERPRISE_ID_MAP.get(enterprise_id, enterprise_id)


def build_enterprise_profiles(accounts):
    lookup = {}
    for index, item in enumerate(accounts):
        theme = THEME_PRESETS[index % len(THEME_PRESETS)]
        camera_name = camera_name_for_type(item.get("business_type", "General"))
        lookup[item["enterprise_id"]] = {
            "enterprise_id": item["enterprise_id"],
            "company_name": item["company_name"],
            "dashboard_title": f"{item['company_name']} Enterprise Dashboard - Tourism Analytics Portal",
            "logo_url": f"https://placehold.co/96x96/{theme['accent'].replace('#', '')}/FFFFFF?text={item['company_name'][:2].upper()}",
            "linked_lgu_id": item["linked_lgu_id"],
            "barangay": item.get("barangay", "Unassigned"),
            "timezone": "PST",
            "theme": theme,
            "cameras": [
                {
                    "camera_id": f"cam_{item['enterprise_id']}_01",
                    "name": camera_name,
                    "status": "ACTIVE",
                }
            ],
        }
    return lookup


ENTERPRISE_PROFILE_LOOKUP = build_enterprise_profiles(ENTERPRISE_ACCOUNTS)


class ReportingWindowAction(BaseModel):
    enterprise_id: str
    period: str


class EnterpriseReportSubmission(BaseModel):
    enterprise_id: str
    period: str
    payload: dict | None = None


class ReportingWindowBulkAction(BaseModel):
    period: str


class EnterpriseActionRequest(BaseModel):
    enterprise_id: str
    message: str | None = None


REPORTING_WINDOWS = {
    item["enterprise_id"]: {
        "enterprise_id": item["enterprise_id"],
        "period": "2026-03",
        "status": "CLOSED",
        "opened_at": "",
        "opened_by": "",
    }
    for item in ENTERPRISE_ACCOUNTS
}


ENTERPRISE_ACTION_LOGS = []
CAMERA_RUNTIME = {
    item["enterprise_id"]: {
        "frame": 0,
        "events": [],
        "latest_frame": None,
    }
    for item in ENTERPRISE_ACCOUNTS
}

CAMERA_SUBSCRIBERS: Dict[str, Set[WebSocket]] = {
    item["enterprise_id"]: set()
    for item in ENTERPRISE_ACCOUNTS
}
CAMERA_BROADCAST_TASKS: Dict[str, asyncio.Task] = {}


AUTHORITY_PACKAGES = {}


def get_enterprise_profile(enterprise_id: str):
    enterprise_id = resolve_enterprise_id(enterprise_id)
    profile = ENTERPRISE_PROFILE_LOOKUP.get(enterprise_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")
    return profile


def get_reporting_window(enterprise_id: str):
    enterprise_id = resolve_enterprise_id(enterprise_id)
    window = REPORTING_WINDOWS.get(enterprise_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")
    return window


def get_enterprise_account(enterprise_id: str):
    enterprise_id = resolve_enterprise_id(enterprise_id)
    enterprise = next((item for item in ENTERPRISE_ACCOUNTS if item["enterprise_id"] == enterprise_id), None)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")
    return enterprise


def build_timeslots():
    return [
        "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM",
        "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM", "10:00 PM",
    ]


def build_archies_dashboard_payload(date: str | None = None, enterprise_id: str = "ent_archies_001"):
    profile = get_enterprise_profile(enterprise_id)
    seed = sum(ord(ch) for ch in enterprise_id)
    rng = random.Random(seed)
    timeslots = build_timeslots()
    chart_points = []
    for index, slot in enumerate(timeslots):
        base = 25 + int(18 * (1 + (index % 5) / 4))
        peak_boost = 14 if slot in ["12:00 PM", "1:00 PM", "6:00 PM", "7:00 PM"] else 0
        male = base + peak_boost + rng.randint(0, 6)
        female = int(male * (0.86 + (rng.randint(0, 8) / 100)))
        chart_points.append(
            {
                "time_slot": slot,
                "male_total": male,
                "female_total": female,
                "male": {
                    "tourist": max(4, male // 3),
                    "local_resident": max(8, male // 2),
                    "non_local_resident": max(3, male // 4),
                },
                "female": {
                    "tourist": max(4, female // 3),
                    "local_resident": max(8, female // 2),
                    "non_local_resident": max(3, female // 4),
                },
            }
        )

    detailed_rows = []
    for day in range(1, 31):
        for point in chart_points:
            detailed_rows.append(
                {
                    "date": f"2026-03-{day:02d}",
                    "time_slot": point["time_slot"],
                    "male_total": point["male_total"] + rng.randint(-4, 5),
                    "female_total": point["female_total"] + rng.randint(-4, 5),
                }
            )

    total_visitors = sum(max(5, row["male_total"] + row["female_total"]) for row in detailed_rows)

    return {
        "enterprise_id": enterprise_id,
        "date": date or "2026-03-26",
        "timezone": "PST",
        "header": {
            "company_name": profile["dashboard_title"],
            "datetime_label": datetime.now().strftime("%B %d, %Y | %I:%M %p PST"),
        },
        "key_stats": {
            "total_visitors_mtd": total_visitors,
            "total_visitors_mtd_trend_pct": round(8 + (seed % 6) + 0.3, 1),
            "peak_visitor_hours": ["12:00 PM - 2:00 PM", "6:00 PM - 8:00 PM"],
            "clustered_chart_mode": "1h window",
            "average_dwell_time": "1h 22m",
        },
        "clustered_column_chart": chart_points,
        "detailed_detection_rows": detailed_rows,
        "visitor_residence_breakdown": {
            "Foreigner": 24,
            "Non-Local Resident": 31,
            "Local Resident": 45,
        },
        "peak_visit_frequency_by_residence": [
            {"category": "Local", "value": 428},
            {"category": "Non-Local", "value": 301},
            {"category": "Foreigner", "value": 233},
        ],
        "cctv_status": "CCTV Status: ACTIVE (Main Entrance - Camera 1)",
        "ai_detection_stream": [
            {
                "track_id": "trk_77881",
                "label": "Female Tourist",
                "bbox": {"x": 34, "y": 24, "w": 21, "h": 53},
            },
            {
                "track_id": "trk_77882",
                "label": "Male Visitor",
                "bbox": {"x": 60, "y": 20, "w": 20, "h": 52},
            },
        ],
        "recent_syncs": [
            "Sync ID: 1024 - Female Tourist | 08:29 PM PST",
            "Sync ID: 1023 - Male Local Resident | 08:27 PM PST",
            "Sync ID: 1022 - Female Non-Local Resident | 08:25 PM PST",
            "Sync ID: 1021 - Male Tourist | 08:22 PM PST",
        ],
    }


def build_report_pack(period: str, enterprise_id: str = "ent_archies_001"):
    dashboard = build_archies_dashboard_payload(enterprise_id=enterprise_id)
    profile = get_enterprise_profile(enterprise_id)
    window = get_reporting_window(enterprise_id)
    daily_summary = []
    rng = random.Random(sum(ord(ch) for ch in enterprise_id) + len(period))
    for day in range(1, 31):
        daily_summary.append(
            {
                "date": f"{period}-{day:02d}",
                "total_visitors": 240 + rng.randint(0, 180),
                "avg_dwell_minutes": 48 + rng.randint(0, 55),
                "peak_hour": random.choice(build_timeslots()),
            }
        )

    return {
        "report_id": f"rpt_{enterprise_id}_{period.replace('-', '_')}",
        "enterprise_id": enterprise_id,
        "enterprise_name": profile["company_name"],
        "linked_lgu_id": profile["linked_lgu_id"],
        "period": {
            "month": period,
            "start": f"{period}-01",
            "end": f"{period}-31",
        },
        "submitted_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S-08:00"),
        "submitted_by_user_id": "usr_archies_admin_01",
        "kpis": {
            "total_visitors_mtd": dashboard["key_stats"]["total_visitors_mtd"],
            "trend_pct": dashboard["key_stats"]["total_visitors_mtd_trend_pct"],
            "avg_dwell": dashboard["key_stats"]["average_dwell_time"],
            "peak_visitor_hours": dashboard["key_stats"]["peak_visitor_hours"],
        },
        "charts": {
            "clustered_column_chart": dashboard["clustered_column_chart"],
            "visitor_residence_breakdown": dashboard["visitor_residence_breakdown"],
            "peak_visit_frequency_by_residence": dashboard["peak_visit_frequency_by_residence"],
            "daily_summary": daily_summary,
            "detailed_detection_rows": dashboard["detailed_detection_rows"],
        },
        "audit": {
            "source": "enterprise-dashboard",
            "sync_transaction_id": f"txn_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "reporting_window_status_at_submit": window["status"],
            "records_included": len(dashboard["detailed_detection_rows"]),
        },
    }


LGU_REPORT_PACKS = [build_report_pack("2026-02")]


def escape_pdf_text(text: str):
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def build_minimal_pdf(lines: list[str]):
    stream_lines = ["BT", "/F1 12 Tf", "50 800 Td"]
    for index, line in enumerate(lines):
        if index > 0:
            stream_lines.append("0 -16 Td")
        stream_lines.append(f"({escape_pdf_text(line)}) Tj")
    stream_lines.append("ET")
    stream_content = "\n".join(stream_lines).encode("utf-8")

    objects = []
    objects.append(b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
    objects.append(b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
    objects.append(
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
    )
    objects.append(b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n")
    objects.append(
        b"5 0 obj\n<< /Length "
        + str(len(stream_content)).encode("utf-8")
        + b" >>\nstream\n"
        + stream_content
        + b"\nendstream\nendobj\n"
    )

    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj

    xref_pos = len(pdf)
    pdf += b"xref\n0 6\n0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode("utf-8")

    pdf += (
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n"
        + str(xref_pos).encode("utf-8")
        + b"\n%%EOF"
    )
    return pdf


def build_minimal_docx(lines: list[str]):
    document_xml = "".join(
        [
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
            '<w:body>',
            *[
                f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>"
                for line in lines
            ],
            '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>',
            '</w:body>',
            '</w:document>',
        ]
    )

    content_types = """<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>
<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\">
  <Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/>
  <Default Extension=\"xml\" ContentType=\"application/xml\"/>
  <Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/>
</Types>"""

    root_rels = """<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>
<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">
  <Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/>
</Relationships>"""

    docx_bytes = io.BytesIO()
    with zipfile.ZipFile(docx_bytes, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", content_types)
        zf.writestr("_rels/.rels", root_rels)
        zf.writestr("word/document.xml", document_xml)

    return docx_bytes.getvalue()


def build_professional_authority_pdf(report: dict, package: dict, stats: dict):
    def text(x: int, y: int, size: int, line: str):
        return f"BT /F1 {size} Tf {x} {y} Td ({escape_pdf_text(line)}) Tj ET"

    def hline(x1: int, y: int, x2: int):
        return f"{x1} {y} m {x2} {y} l S"

    top_peak = package.get("executive_summary", {}).get("top_peak_hours", [])
    peak_line = ", ".join(top_peak[:3]) if top_peak else "N/A"

    commands = [
        "0.15 w",
        "42 42 511 758 re S",
        text(52, 780, 18, "SAN PEDRO LGU - AUTHORITY SUBMISSION PACKAGE"),
        text(52, 760, 10, "Prepared for Provincial Office Review"),
        hline(52, 748, 545),
        text(52, 730, 12, "Package Metadata"),
        text(52, 714, 10, f"Package ID: {package['authority_package_id']}"),
        text(52, 700, 10, f"Report ID: {report['report_id']}"),
        text(52, 686, 10, f"Generated At: {package['generated_at']}"),
        text(52, 672, 10, f"Classification: {package['classification']}"),
        hline(52, 660, 545),
        text(52, 642, 12, "Enterprise Summary"),
        text(52, 626, 10, f"Enterprise: {report['enterprise_name']} ({report['enterprise_id']})"),
        text(52, 612, 10, f"Reporting Period: {report.get('period', {}).get('month', 'N/A')}"),
        text(52, 598, 10, f"Submitted At: {report.get('submitted_at', 'N/A')}"),
        hline(52, 586, 545),
        text(52, 568, 12, "Computed Traffic Metrics (Validated from Detailed Rows)"),
        text(52, 552, 10, f"Total Visitors (Computed): {stats['computed_total_visitors']}"),
        text(52, 538, 10, f"Male Visitors (Computed): {stats['male_total']}"),
        text(52, 524, 10, f"Female Visitors (Computed): {stats['female_total']}"),
        text(52, 510, 10, f"Detailed Detection Records: {stats['records_included']}"),
        text(52, 496, 10, f"Average Dwell Time: {package['executive_summary']['average_dwell']}"),
        text(52, 482, 10, f"Top Peak Hours: {peak_line}"),
        hline(52, 470, 545),
        text(52, 452, 12, "Quality and Compliance"),
        text(52, 436, 10, f"Daily Summary Total: {stats['daily_summary_total']}"),
        text(52, 422, 10, f"Data Consistency Check: {stats['consistency_status']}"),
        text(52, 408, 10, f"Submission Window State: {report.get('audit', {}).get('reporting_window_status_at_submit', 'N/A')}"),
        text(52, 394, 10, f"Sync Transaction: {report.get('audit', {}).get('sync_transaction_id', 'N/A')}"),
        hline(52, 382, 545),
        text(52, 364, 12, "Transmittal Notes"),
        text(52, 348, 10, "This package is generated from the LGU enterprise analytics workflow."),
        text(52, 334, 10, "All metrics above are computed from submitted CCTV detection records."),
        text(52, 320, 10, "Ready for onward endorsement to provincial authorities."),
        hline(52, 120, 545),
        text(52, 102, 10, "Prepared by: LGU Analytics and Reporting Office"),
        text(52, 88, 10, "Reviewed by: _________________________________"),
        text(52, 74, 10, "Date: ______________________________________"),
    ]

    stream_content = "\n".join(commands).encode("utf-8")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        b"5 0 obj\n<< /Length " + str(len(stream_content)).encode("utf-8") + b" >>\nstream\n" + stream_content + b"\nendstream\nendobj\n",
    ]

    pdf = b"%PDF-1.4\n"
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf += obj

    xref_pos = len(pdf)
    pdf += b"xref\n0 6\n0000000000 65535 f \n"
    for offset in offsets[1:]:
        pdf += f"{offset:010d} 00000 n \n".encode("utf-8")

    pdf += b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + str(xref_pos).encode("utf-8") + b"\n%%EOF"
    return pdf


def compute_report_statistics(report: dict):
    detailed_rows = report.get("charts", {}).get("detailed_detection_rows", [])
    daily_summary = report.get("charts", {}).get("daily_summary", [])

    male_total = sum(int(row.get("male_total", 0)) for row in detailed_rows)
    female_total = sum(int(row.get("female_total", 0)) for row in detailed_rows)
    computed_total_visitors = male_total + female_total
    records_included = len(detailed_rows)

    daily_summary_total = sum(int(day.get("total_visitors", 0)) for day in daily_summary)
    avg_dwell_minutes = (
        round(sum(int(day.get("avg_dwell_minutes", 0)) for day in daily_summary) / len(daily_summary))
        if daily_summary
        else 0
    )

    consistency_status = "PASS" if daily_summary_total <= computed_total_visitors else "REVIEW_REQUIRED"
    top_peak_hours = []
    if daily_summary:
        ranked = sorted(daily_summary, key=lambda x: int(x.get("total_visitors", 0)), reverse=True)
        seen = set()
        for item in ranked:
            peak = item.get("peak_hour")
            if peak and peak not in seen:
                seen.add(peak)
                top_peak_hours.append(peak)
            if len(top_peak_hours) >= 3:
                break

    return {
        "male_total": male_total,
        "female_total": female_total,
        "computed_total_visitors": computed_total_visitors,
        "records_included": records_included,
        "daily_summary_total": daily_summary_total,
        "avg_dwell_minutes": avg_dwell_minutes,
        "consistency_status": consistency_status,
        "top_peak_hours": top_peak_hours,
    }


async def camera_broadcast_worker(enterprise_id: str):
    try:
        while CAMERA_SUBSCRIBERS.get(enterprise_id):
            frame = build_camera_frame(enterprise_id)
            CAMERA_RUNTIME[enterprise_id]["latest_frame"] = frame

            stale_clients = []
            for subscriber in list(CAMERA_SUBSCRIBERS[enterprise_id]):
                try:
                    await subscriber.send_json(frame)
                except Exception:
                    stale_clients.append(subscriber)

            for subscriber in stale_clients:
                CAMERA_SUBSCRIBERS[enterprise_id].discard(subscriber)

            await asyncio.sleep(1)
    finally:
        CAMERA_BROADCAST_TASKS.pop(enterprise_id, None)


async def ensure_camera_broadcast(enterprise_id: str):
    task = CAMERA_BROADCAST_TASKS.get(enterprise_id)
    if not task or task.done():
        CAMERA_BROADCAST_TASKS[enterprise_id] = asyncio.create_task(camera_broadcast_worker(enterprise_id))


def build_camera_frame(enterprise_id: str):
    runtime = CAMERA_RUNTIME[enterprise_id]
    runtime["frame"] += 1
    frame = runtime["frame"]
    base = sum(ord(ch) for ch in enterprise_id)
    rng = random.Random(base + frame)

    labels = [
        "Male Tourist",
        "Female Local Resident",
        "Male Non-Local Resident",
        "Female Tourist",
    ]

    boxes = []
    for idx in range(4):
        boxes.append(
            {
                "id": f"trk_{enterprise_id[-3:]}_{idx+1}",
                "label": labels[idx],
                "x": 8 + ((frame * (idx + 1) * 3) % 70),
                "y": 18 + (idx * 8) + rng.randint(-2, 2),
                "w": 14 + rng.randint(2, 8),
                "h": 32 + rng.randint(4, 10),
            }
        )

    stamp = datetime.now().strftime("%I:%M:%S %p")
    event = f"Frame {frame}: {', '.join(item['label'] for item in boxes)} | {stamp} PST"
    runtime["events"].insert(0, event)
    runtime["events"] = runtime["events"][:300]

    return {
        "enterprise_id": enterprise_id,
        "frame": frame,
        "fps": 6 + (frame % 4),
        "active_tracks": len(boxes),
        "status": "RUNNING",
        "camera_name": get_enterprise_profile(enterprise_id)["cameras"][0]["name"],
        "sample_video_url": "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
        "boxes": boxes,
        "events": runtime["events"][:100],
    }


def build_default_analytics(enterprise_id: int):
    base = 45 + (enterprise_id % 20)
    female = 100 - base
    return {
        "demographics": [
            {"name": "Male", "value": base},
            {"name": "Female", "value": female},
        ],
        "residency": [
            {"name": "Residents", "value": 65 + (enterprise_id % 15)},
            {"name": "Non-Residents", "value": 25 - (enterprise_id % 8)},
            {"name": "Foreign Tourists", "value": 10 + (enterprise_id % 4)},
        ],
        "visitorTrends": [
            {"month": "Jan", "visitors": 250 + (enterprise_id * 8)},
            {"month": "Feb", "visitors": 280 + (enterprise_id * 8)},
            {"month": "Mar", "visitors": 310 + (enterprise_id * 8)},
            {"month": "Apr", "visitors": 345 + (enterprise_id * 8)},
            {"month": "May", "visitors": 375 + (enterprise_id * 8)},
            {"month": "Jun", "visitors": 405 + (enterprise_id * 8)},
        ],
        "reportHistory": [
            {
                "date": "2026-01-10",
                "type": "Monthly Foot Traffic",
                "status": "Submitted",
            },
            {
                "date": "2026-02-10",
                "type": "Safety & Compliance",
                "status": "Approved",
            },
            {
                "date": "2026-03-10",
                "type": "Quarterly Demographics",
                "status": "Pending",
            },
        ],
    }


def health_check():
    return {"status": "ok"}


def get_overview():
    return OVERVIEW


def get_barangays():
    enterprise_count = {}
    for enterprise in ENTERPRISES:
        key = enterprise["barangay"].lower()
        enterprise_count[key] = enterprise_count.get(key, 0) + 1

    enriched_barangays = []
    for barangay in BARANGAYS:
        enriched_barangays.append(
            {
                **barangay,
                "enterpriseCount": enterprise_count.get(barangay["name"].lower(), 0),
            }
        )

    return {"barangays": enriched_barangays, "heatmap": HEATMAP_POINTS}


def get_barangays_geojson():
    features = []
    for barangay in BARANGAYS:
        ring = [[point["lng"], point["lat"]] for point in barangay["coordinates"]]
        if ring[0] != ring[-1]:
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
        for enterprise in ENTERPRISES
        if enterprise["barangay"].lower() == barangay_name.lower()
    ]
    return {"barangay": barangay_name, "enterprises": matches}


def get_enterprises():
    return {"enterprises": ENTERPRISES}


def get_enterprise_analytics(enterprise_id: int):
    enterprise = next((e for e in ENTERPRISES if e["id"] == enterprise_id), None)
    if not enterprise:
        raise DomainNotFoundError("Enterprise not found")

    analytics = ENTERPRISE_ANALYTICS.get(enterprise_id) or build_default_analytics(enterprise_id)

    return {
        "enterprise": enterprise,
        "analytics": analytics,
    }


def get_reports():
    return REPORTS


def get_logs():
    return {"logs": LOGS}


def get_enterprise_profile_endpoint(enterprise_id: str = "ent_archies_001"):
    profile = {**get_enterprise_profile(enterprise_id)}
    window = get_reporting_window(enterprise_id)
    profile["reporting_window_status"] = window["status"]
    return profile


def get_enterprise_accounts():
    accounts = []
    for item in ENTERPRISE_ACCOUNTS:
        profile = get_enterprise_profile(item["enterprise_id"])
        accounts.append(
            {
                "enterprise_id": item["enterprise_id"],
                "company_name": item["company_name"],
                "dashboard_title": profile["dashboard_title"],
                "linked_lgu_id": item["linked_lgu_id"],
                "logo_url": profile["logo_url"],
                "theme": profile["theme"],
            }
        )
    return {"accounts": accounts}


def get_enterprise_dashboard(date: str | None = None, enterprise_id: str = "ent_archies_001"):
    get_enterprise_account(enterprise_id)
    return build_archies_dashboard_payload(date, enterprise_id)


def get_reporting_window_status(enterprise_id: str = "ent_archies_001"):
    return get_reporting_window(enterprise_id)


def export_enterprise_csv(enterprise_id: str = "ent_archies_001"):
    dashboard = build_archies_dashboard_payload(enterprise_id=enterprise_id)
    rows = [
        "date,time_slot,male_total,female_total,total",
    ]
    for row in dashboard["detailed_detection_rows"]:
        total = row["male_total"] + row["female_total"]
        rows.append(f"{row['date']},{row['time_slot']},{row['male_total']},{row['female_total']},{total}")

    csv = "\n".join(rows)
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{enterprise_id}_analytics.csv"'},
    )


def export_enterprise_pdf(enterprise_id: str = "ent_archies_001"):
    dashboard = build_archies_dashboard_payload(enterprise_id=enterprise_id)
    profile = get_enterprise_profile(enterprise_id)
    lines = [
        f"{profile['company_name']} Monthly Tourism Report",
        f"Period: {get_reporting_window(enterprise_id)['period']}",
        f"Total Visitors MTD: {dashboard['key_stats']['total_visitors_mtd']}",
        f"Average Dwell Time: {dashboard['key_stats']['average_dwell_time']}",
        f"Peak Hours: {', '.join(dashboard['key_stats']['peak_visitor_hours'])}",
        f"Records Included: {len(dashboard['detailed_detection_rows'])}",
    ]
    mock_pdf = build_minimal_pdf(lines)
    return Response(
        content=mock_pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{enterprise_id}_monthly_report.pdf"'},
    )


def submit_enterprise_report(body: EnterpriseReportSubmission):
    enterprise = get_enterprise_account(body.enterprise_id)
    window = get_reporting_window(body.enterprise_id)

    if enterprise["linked_lgu_id"] != ARCHIES_ENTERPRISE_PROFILE["linked_lgu_id"]:
        raise DomainForbiddenError("Enterprise is not linked to this LGU")

    if window["status"] != "OPEN":
        raise DomainConflictError("Reporting window is currently CLOSED")

    report_pack = body.payload if body.payload else build_report_pack(body.period, body.enterprise_id)
    if not body.payload:
        report_pack["period"]["month"] = body.period
        report_pack["enterprise_id"] = body.enterprise_id
        report_pack["enterprise_name"] = enterprise["company_name"]
        report_pack["linked_lgu_id"] = enterprise["linked_lgu_id"]
        report_pack["report_id"] = f"rpt_{body.enterprise_id}_{body.period.replace('-', '_')}"

    if not any(pack["report_id"] == report_pack["report_id"] for pack in LGU_REPORT_PACKS):
        LGU_REPORT_PACKS.append(report_pack)

    window["status"] = "SUBMITTED"

    return {
        "message": "Report submitted successfully to linked LGU account",
        "report_id": report_pack["report_id"],
        "status": "SUBMITTED",
    }


def get_lgu_overview():
    submitted = sum(1 for item in REPORTING_WINDOWS.values() if item["status"] == "SUBMITTED")
    total_enterprises = len(ENTERPRISE_ACCOUNTS)
    return {
        "lgu_id": "lgu_san_pedro_001",
        "name": "San Pedro LGU",
        "total_linked_enterprises": total_enterprises,
        "submitted_reports_current_period": submitted,
        "submission_completion_rate_pct": round((submitted / total_enterprises) * 100, 2),
        "active_reporting_window": get_reporting_window(ARCHIES_ENTERPRISE_PROFILE["enterprise_id"]),
    }


def get_lgu_reports(period: str | None = None, enterprise_id: str | None = None):
    packs = LGU_REPORT_PACKS

    if period:
        packs = [item for item in packs if item.get("period", {}).get("month") == period]

    if enterprise_id:
        packs = [item for item in packs if item.get("enterprise_id") == enterprise_id]

    return {"reports": packs}


def get_lgu_report_detail(report_id: str):
    report = next((item for item in LGU_REPORT_PACKS if item["report_id"] == report_id), None)
    if not report:
        raise DomainNotFoundError("Report not found")

    return report


def generate_authority_package(report_id: str):
    report = next((item for item in LGU_REPORT_PACKS if item["report_id"] == report_id), None)
    if not report:
        raise DomainNotFoundError("Report not found")

    stats = compute_report_statistics(report)
    avg_dwell = report.get("kpis", {}).get("avg_dwell") or f"{stats['avg_dwell_minutes'] // 60}h {stats['avg_dwell_minutes'] % 60}m"

    package = {
        "authority_package_id": f"auth_{report_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "generated_at": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p PST"),
        "classification": "READY_FOR_HIGHER_AUTHORITY_SUBMISSION",
        "executive_summary": {
            "enterprise": report["enterprise_name"],
            "period": report["period"]["month"],
            "total_visitors": stats["computed_total_visitors"],
            "average_dwell": avg_dwell,
            "top_peak_hours": stats["top_peak_hours"] or report.get("kpis", {}).get("peak_visitor_hours", []),
        },
        "compliance_notes": [
            "AI detections include sex and residence classification categories.",
            "Monthly report generated under LGU-opened reporting window.",
            f"Records included: {stats['records_included']}",
            f"Data consistency check: {stats['consistency_status']}",
        ],
        "attachments": [
            "enterprise_monthly_pdf",
            "detailed_detection_csv",
            "demographic_visual_summary",
            "audit_trail",
        ],
    }

    AUTHORITY_PACKAGES[report_id] = package
    return package


def download_authority_package_pdf(report_id: str):
    report = next((item for item in LGU_REPORT_PACKS if item["report_id"] == report_id), None)
    if not report:
        raise DomainNotFoundError("Report not found")

    package = AUTHORITY_PACKAGES.get(report_id) or generate_authority_package(report_id)
    stats = compute_report_statistics(report)
    pdf_content = build_professional_authority_pdf(report, package, stats)
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="authority_package_{report_id}.pdf"'},
    )


def download_authority_package_docx(report_id: str):
    report = next((item for item in LGU_REPORT_PACKS if item["report_id"] == report_id), None)
    if not report:
        raise DomainNotFoundError("Report not found")

    package = AUTHORITY_PACKAGES.get(report_id) or generate_authority_package(report_id)
    stats = compute_report_statistics(report)
    lines = [
        "LGU Authority Submission Package",
        f"Package ID: {package['authority_package_id']}",
        f"Enterprise: {report['enterprise_name']}",
        f"Period: {report['period']['month']}",
        f"Total Visitors (Computed): {stats['computed_total_visitors']}",
        f"Average Dwell: {package.get('executive_summary', {}).get('average_dwell', 'N/A')}",
        f"Records Included: {stats['records_included']}",
        f"Data Consistency: {stats['consistency_status']}",
    ]
    docx_content = build_minimal_docx(lines)
    return Response(
        content=docx_content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="authority_package_{report_id}.docx"'},
    )


def open_reporting_window(body: ReportingWindowAction):
    get_enterprise_account(body.enterprise_id)
    window = get_reporting_window(body.enterprise_id)
    window["period"] = body.period
    window["status"] = "OPEN"
    window["opened_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S-08:00")
    window["opened_by"] = "lgu_admin_01"
    return window


def close_reporting_window(body: ReportingWindowAction):
    get_enterprise_account(body.enterprise_id)
    window = get_reporting_window(body.enterprise_id)
    window["period"] = body.period
    window["status"] = "CLOSED"
    return window


def open_reporting_window_all(body: ReportingWindowBulkAction):
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S-08:00")
    for item in REPORTING_WINDOWS.values():
        item["period"] = body.period
        item["status"] = "OPEN"
        item["opened_at"] = now
        item["opened_by"] = "lgu_admin_01"

    return {
        "message": "All enterprise reporting windows are OPEN",
        "period": body.period,
        "total_enterprises": len(REPORTING_WINDOWS),
    }


def close_reporting_window_all(body: ReportingWindowBulkAction):
    for item in REPORTING_WINDOWS.values():
        item["period"] = body.period
        item["status"] = "CLOSED"

    return {
        "message": "All enterprise reporting windows are CLOSED",
        "period": body.period,
        "total_enterprises": len(REPORTING_WINDOWS),
    }


def get_lgu_enterprise_accounts(period: str | None = None):
    target_period = period or "2026-03"
    accounts = []
    for item in ENTERPRISE_ACCOUNTS:
        window = get_reporting_window(item["enterprise_id"])
        has_report = any(
            report.get("enterprise_id") == item["enterprise_id"]
            and report.get("period", {}).get("month") == target_period
            for report in LGU_REPORT_PACKS
        )

        accounts.append(
            {
                **item,
                "period": window["period"],
                "reporting_window_status": window["status"],
                "has_submitted_for_period": has_report,
            }
        )

    return {"accounts": accounts, "period": target_period}


def enterprise_request_maintenance(body: EnterpriseActionRequest):
    get_enterprise_account(body.enterprise_id)
    ticket = {
        "ticket_id": f"mnt_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "enterprise_id": body.enterprise_id,
        "type": "maintenance",
        "message": body.message or "General CCTV / AI service check requested.",
        "created_at": datetime.now().strftime("%Y-%m-%d %I:%M %p PST"),
    }
    ENTERPRISE_ACTION_LOGS.append(ticket)
    return {"message": "Maintenance request submitted.", "ticket": ticket}


def enterprise_manual_log_correction(body: EnterpriseActionRequest):
    get_enterprise_account(body.enterprise_id)
    ticket = {
        "ticket_id": f"mlc_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "enterprise_id": body.enterprise_id,
        "type": "manual-log-correction",
        "message": body.message or "Manual detection log correction requested.",
        "created_at": datetime.now().strftime("%Y-%m-%d %I:%M %p PST"),
    }
    ENTERPRISE_ACTION_LOGS.append(ticket)
    return {"message": "Manual log correction request submitted.", "ticket": ticket}


def get_enterprise_report_history(enterprise_id: str = "ent_archies_001"):
    get_enterprise_account(enterprise_id)
    reports = [item for item in LGU_REPORT_PACKS if item.get("enterprise_id") == enterprise_id]
    reports_sorted = sorted(reports, key=lambda item: item.get("submitted_at", ""), reverse=True)
    return {"enterprise_id": enterprise_id, "reports": reports_sorted}


def get_enterprise_camera_stream(enterprise_id: str = "ent_archies_001"):
    enterprise_id = resolve_enterprise_id(enterprise_id)
    get_enterprise_account(enterprise_id)
    latest = CAMERA_RUNTIME[enterprise_id].get("latest_frame")
    if latest:
        return latest

    frame = build_camera_frame(enterprise_id)
    CAMERA_RUNTIME[enterprise_id]["latest_frame"] = frame
    return frame


async def ws_enterprise_camera_stream(websocket: WebSocket, enterprise_id: str):
    enterprise_id = resolve_enterprise_id(enterprise_id)
    if not any(item["enterprise_id"] == enterprise_id for item in ENTERPRISE_ACCOUNTS):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    CAMERA_SUBSCRIBERS.setdefault(enterprise_id, set()).add(websocket)

    latest = CAMERA_RUNTIME[enterprise_id].get("latest_frame")
    if latest:
        await websocket.send_json(latest)

    await ensure_camera_broadcast(enterprise_id)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        CAMERA_SUBSCRIBERS.get(enterprise_id, set()).discard(websocket)


def get_enterprise_recommendations(enterprise_id: str = "ent_archies_001"):
    get_enterprise_account(enterprise_id)
    return {
        "enterprise_id": enterprise_id,
        "recommendations": [
            {
                "id": "rec_1",
                "feature": "Staffing Level Optimization Prediction",
                "recommendation": "Add 2 floor staff during 12:00 PM - 2:00 PM peak windows.",
                "confidence": 0.89,
            },
            {
                "id": "rec_2",
                "feature": "Dwell Time & Traffic Anomaly Alerts",
                "recommendation": "Trigger anomaly alert when dwell exceeds 95 minutes in 2 consecutive intervals.",
                "confidence": 0.83,
            },
            {
                "id": "rec_3",
                "feature": "Multi-Camera Path Tracing",
                "recommendation": "Enable re-identification across entrances to measure visitor movement funnel.",
                "confidence": 0.78,
            },
            {
                "id": "rec_4",
                "feature": "Customer Density Heatmapping",
                "recommendation": "Render 15-minute heatmaps and auto-alert on congestion zones.",
                "confidence": 0.86,
            },
            {
                "id": "rec_5",
                "feature": "Campaign Conversion Overlay",
                "recommendation": "Correlate promo windows with footfall and dwell to optimize campaign spend.",
                "confidence": 0.74,
            },
            {
                "id": "rec_6",
                "feature": "Queue Time Estimator",
                "recommendation": "Predict queue build-up by entrance and trigger lane staffing recommendation.",
                "confidence": 0.8,
            },
            {
                "id": "rec_7",
                "feature": "Maintenance Risk Scoring",
                "recommendation": "Automatically score camera downtime risk from FPS and tracking drops.",
                "confidence": 0.77,
            },
        ],
    }
