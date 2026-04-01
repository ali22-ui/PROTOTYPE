from datetime import datetime, timezone

from app.core.supabase import get_supabase_client, is_supabase_available
from app.domain import core_runtime as core
from app.state import runtime_store


def _pick_int(row: dict, *keys: str) -> int:
    for key in keys:
        value = row.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return int(value)
    return 0


def _parse_iso_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)

    return parsed.astimezone(timezone.utc)


def _month_bounds(date: str | None) -> tuple[datetime, datetime, str]:
    now = datetime.now(timezone.utc)
    base: datetime

    if date:
        try:
            if len(date) == 7:
                base = datetime.strptime(date, "%Y-%m").replace(tzinfo=timezone.utc)
            else:
                parsed = datetime.fromisoformat(date.replace("Z", "+00:00"))
                base = parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            base = now
    else:
        base = now

    start = base.astimezone(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    return start, end, start.date().isoformat()


def _to_slot_label(hour: int) -> str:
    normalized = max(0, min(23, int(hour)))
    suffix = "AM" if normalized < 12 else "PM"
    hour12 = normalized % 12 or 12
    return f"{hour12}:00 {suffix}"


def _format_dwell(seconds: int) -> str:
    safe_seconds = max(0, int(seconds))
    hours, remainder = divmod(safe_seconds, 3600)
    minutes = remainder // 60
    return f"{hours}h {minutes:02d}m"


def _build_empty_dashboard_payload(
    enterprise_id: str,
    report_date: str,
    company_name: str,
    camera_name: str,
    camera_status: str,
) -> dict:
    return {
        "enterprise_id": enterprise_id,
        "date": report_date,
        "timezone": "UTC",
        "header": {
            "company_name": f"{company_name} Enterprise Dashboard - Tourism Analytics Portal",
            "datetime_label": datetime.now().strftime("%B %d, %Y | %I:%M %p UTC"),
        },
        "key_stats": {
            "total_visitors_mtd": 0,
            "total_visitors_mtd_trend_pct": 0.0,
            "peak_visitor_hours": [],
            "clustered_chart_mode": "1h window",
            "average_dwell_time": "0h 00m",
        },
        "clustered_column_chart": [],
        "detailed_detection_rows": [],
        "visitor_residence_breakdown": {
            "Foreigner": 0,
            "Non-Local Resident": 0,
            "Local Resident": 0,
        },
        "peak_visit_frequency_by_residence": [
            {"category": "Local", "value": 0},
            {"category": "Non-Local", "value": 0},
            {"category": "Foreigner", "value": 0},
        ],
        "cctv_status": f"CCTV Status: {camera_status} ({camera_name})",
        "ai_detection_stream": [],
    }


def resolve_enterprise_id(enterprise_id: str) -> str:
    return core.resolve_enterprise_id(enterprise_id)


def list_enterprises() -> list[dict]:
    return core.ENTERPRISES


def list_enterprise_accounts() -> list[dict]:
    return core.ENTERPRISE_ACCOUNTS


def get_enterprise_account(enterprise_id: str) -> dict | None:
    target_id = resolve_enterprise_id(enterprise_id)
    return next((item for item in core.ENTERPRISE_ACCOUNTS if item["enterprise_id"] == target_id), None)


def get_enterprise_profile(enterprise_id: str) -> dict | None:
    target_id = resolve_enterprise_id(enterprise_id)
    return core.ENTERPRISE_PROFILE_LOOKUP.get(target_id)


def get_reporting_window(enterprise_id: str) -> dict | None:
    target_id = resolve_enterprise_id(enterprise_id)
    return runtime_store.get_reporting_windows().get(target_id)


def get_archies_profile() -> dict:
    return core.ARCHIES_ENTERPRISE_PROFILE


def get_dashboard_payload(date: str | None = None, enterprise_id: str = "ent_archies_001") -> dict:
    target_id = resolve_enterprise_id(enterprise_id)
    start, end, report_date = _month_bounds(date)

    fallback_profile = get_enterprise_profile(target_id) or {}
    company_name = str(fallback_profile.get("company_name") or target_id)
    camera_name = "Main Entrance Camera"
    camera_status = "INACTIVE"

    if not is_supabase_available():
        return _build_empty_dashboard_payload(target_id, report_date, company_name, camera_name, camera_status)

    client = get_supabase_client()
    if client is None:
        return _build_empty_dashboard_payload(target_id, report_date, company_name, camera_name, camera_status)

    try:
        enterprise_result = (
            client.table("enterprises")
            .select("company_name")
            .eq("id", target_id)
            .limit(1)
            .execute()
        )
        if enterprise_result.data:
            fetched_name = enterprise_result.data[0].get("company_name")
            if isinstance(fetched_name, str) and fetched_name.strip():
                company_name = fetched_name.strip()
    except Exception:
        pass

    try:
        camera_result = (
            client.table("cameras")
            .select("name,status")
            .eq("enterprise_id", target_id)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        )
        if camera_result.data:
            first_camera = camera_result.data[0]
            camera_name = str(first_camera.get("name") or camera_name)
            camera_status = str(first_camera.get("status") or camera_status)
    except Exception:
        pass

    detection_rows: list[dict] = []
    try:
        detection_result = (
            client.table("detection_events")
            .select("track_id,timestamp,sex,dwell_seconds")
            .eq("enterprise_id", target_id)
            .gte("timestamp", start.isoformat())
            .lt("timestamp", end.isoformat())
            .order("timestamp", desc=False)
            .limit(5000)
            .execute()
        )
        detection_rows = detection_result.data or []
    except Exception:
        detection_rows = []

    visitor_rows: list[dict] = []
    try:
        visitor_result = (
            client.table("visitor_statistics")
            .select("date,hour,male_total,male_count,female_total,female_count,unknown_total,unknown_count")
            .eq("enterprise_id", target_id)
            .gte("date", start.date().isoformat())
            .lt("date", end.date().isoformat())
            .limit(2000)
            .execute()
        )
        visitor_rows = visitor_result.data or []
    except Exception:
        visitor_rows = []

    if not detection_rows and not visitor_rows:
        return _build_empty_dashboard_payload(target_id, report_date, company_name, camera_name, camera_status)

    grouped_by_slot: dict[tuple[str, int], dict[str, int]] = {}
    dwell_values: list[int] = []
    stream_candidates: list[tuple[datetime, dict]] = []

    for row in detection_rows:
        timestamp = _parse_iso_datetime(row.get("timestamp"))
        if timestamp is None:
            continue

        day_key = timestamp.date().isoformat()
        hour_key = int(timestamp.hour)
        bucket = grouped_by_slot.setdefault((day_key, hour_key), {"male": 0, "female": 0})

        sex = str(row.get("sex") or "unknown").lower()
        if sex == "male":
            bucket["male"] += 1
        elif sex == "female":
            bucket["female"] += 1

        dwell = max(0, _pick_int(row, "dwell_seconds"))
        dwell_values.append(dwell)
        stream_candidates.append((timestamp, row))

    # Fallback to visitor_statistics rows if raw detection events are unavailable.
    if not grouped_by_slot:
        for row in visitor_rows:
            day_key = str(row.get("date") or "")
            hour_value = row.get("hour")
            if not day_key or not isinstance(hour_value, int):
                continue

            male = _pick_int(row, "male_total", "male_count")
            female = _pick_int(row, "female_total", "female_count")
            bucket = grouped_by_slot.setdefault((day_key, hour_value), {"male": 0, "female": 0})
            bucket["male"] += male
            bucket["female"] += female

    detailed_detection_rows: list[dict] = []
    hourly_chart: dict[int, dict[str, int]] = {}

    for day_key, hour_key in sorted(grouped_by_slot.keys()):
        slot_counts = grouped_by_slot[(day_key, hour_key)]
        male_total = slot_counts["male"]
        female_total = slot_counts["female"]

        detailed_detection_rows.append(
            {
                "date": day_key,
                "time_slot": _to_slot_label(hour_key),
                "male_total": male_total,
                "female_total": female_total,
            }
        )

        hourly_bucket = hourly_chart.setdefault(hour_key, {"male": 0, "female": 0})
        hourly_bucket["male"] += male_total
        hourly_bucket["female"] += female_total

    clustered_column_chart = []
    for hour_key in sorted(hourly_chart.keys()):
        male_total = hourly_chart[hour_key]["male"]
        female_total = hourly_chart[hour_key]["female"]
        clustered_column_chart.append(
            {
                "time_slot": _to_slot_label(hour_key),
                "male_total": male_total,
                "female_total": female_total,
                "male": {
                    "tourist": 0,
                    "local_resident": male_total,
                    "non_local_resident": 0,
                },
                "female": {
                    "tourist": 0,
                    "local_resident": female_total,
                    "non_local_resident": 0,
                },
            }
        )

    total_visitors_mtd = 0
    for row in visitor_rows:
        male = _pick_int(row, "male_total", "male_count")
        female = _pick_int(row, "female_total", "female_count")
        unknown = _pick_int(row, "unknown_total", "unknown_count")
        total_visitors_mtd += max(0, male + female + unknown)

    if total_visitors_mtd == 0:
        total_visitors_mtd = sum(item["male_total"] + item["female_total"] for item in detailed_detection_rows)

    previous_total = 0
    previous_start = start.replace(year=start.year - 1, month=12) if start.month == 1 else start.replace(month=start.month - 1)
    try:
        previous_result = (
            client.table("visitor_statistics")
            .select("male_total,male_count,female_total,female_count,unknown_total,unknown_count")
            .eq("enterprise_id", target_id)
            .gte("date", previous_start.date().isoformat())
            .lt("date", start.date().isoformat())
            .limit(2000)
            .execute()
        )
        for row in previous_result.data or []:
            previous_total += (
                _pick_int(row, "male_total", "male_count")
                + _pick_int(row, "female_total", "female_count")
                + _pick_int(row, "unknown_total", "unknown_count")
            )
    except Exception:
        previous_total = 0

    if previous_total > 0:
        trend_pct = round(((total_visitors_mtd - previous_total) / previous_total) * 100, 1)
    elif total_visitors_mtd > 0:
        trend_pct = 100.0
    else:
        trend_pct = 0.0

    peak_visitor_hours = []
    ranked_hours = sorted(
        hourly_chart.items(),
        key=lambda item: item[1]["male"] + item[1]["female"],
        reverse=True,
    )
    for hour_key, _ in ranked_hours[:2]:
        end_hour = (hour_key + 1) % 24
        peak_visitor_hours.append(f"{_to_slot_label(hour_key)} - {_to_slot_label(end_hour)}")

    average_dwell_seconds = int(sum(dwell_values) / len(dwell_values)) if dwell_values else 0
    tourist_guess = sum(1 for value in dwell_values if value >= 8 * 3600)
    non_local_resident = min(tourist_guess, total_visitors_mtd)
    local_resident = max(0, total_visitors_mtd - non_local_resident)

    ai_detection_stream = []
    for timestamp, row in sorted(stream_candidates, key=lambda item: item[0], reverse=True)[:12]:
        sex = str(row.get("sex") or "unknown").lower()
        if sex == "male":
            label = "Male Visitor"
        elif sex == "female":
            label = "Female Visitor"
        else:
            label = "Unknown Visitor"

        ai_detection_stream.append(
            {
                "track_id": str(row.get("track_id") or "unknown"),
                "label": label,
                "bbox": {"x": 0, "y": 0, "w": 0, "h": 0},
                "confidence": 0,
                "time": timestamp.isoformat(),
            }
        )

    return {
        "enterprise_id": target_id,
        "date": report_date,
        "timezone": "UTC",
        "header": {
            "company_name": f"{company_name} Enterprise Dashboard - Tourism Analytics Portal",
            "datetime_label": datetime.now().strftime("%B %d, %Y | %I:%M %p UTC"),
        },
        "key_stats": {
            "total_visitors_mtd": total_visitors_mtd,
            "total_visitors_mtd_trend_pct": trend_pct,
            "peak_visitor_hours": peak_visitor_hours,
            "clustered_chart_mode": "1h window",
            "average_dwell_time": _format_dwell(average_dwell_seconds),
        },
        "clustered_column_chart": clustered_column_chart,
        "detailed_detection_rows": detailed_detection_rows,
        "visitor_residence_breakdown": {
            "Foreigner": 0,
            "Non-Local Resident": non_local_resident,
            "Local Resident": local_resident,
        },
        "peak_visit_frequency_by_residence": [
            {"category": "Local", "value": local_resident},
            {"category": "Non-Local", "value": non_local_resident},
            {"category": "Foreigner", "value": 0},
        ],
        "cctv_status": f"CCTV Status: {camera_status} ({camera_name})",
        "ai_detection_stream": ai_detection_stream,
    }


def list_recommendations() -> list[dict]:
    return [
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
    ]


def update_compliance_status(enterprise_id: str, status: str) -> bool:
    """Update the compliance_status for an enterprise in both runtime and Supabase if available."""
    target_id = resolve_enterprise_id(enterprise_id)
    
    # Update in-memory runtime store
    for account in core.ENTERPRISE_ACCOUNTS:
        if account["enterprise_id"] == target_id:
            account["compliance_status"] = status
            break
    
    # Also update in Supabase if available
    if is_supabase_available():
        client = get_supabase_client()
        if client:
            try:
                client.table("enterprises").update({"compliance_status": status}).eq("id", target_id).execute()
                return True
            except Exception:
                pass
    
    return True
