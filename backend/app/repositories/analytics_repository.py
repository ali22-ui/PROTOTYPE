from datetime import datetime, timedelta, timezone

from app.core.supabase import get_supabase_client, is_supabase_available
from app.domain import core_runtime as core


def _parse_month(month: str | None) -> tuple[datetime, datetime, str]:
    now = datetime.now(timezone.utc)
    if month:
        try:
            start = datetime.strptime(month, "%Y-%m").replace(tzinfo=timezone.utc)
        except ValueError:
            start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    return start, end, start.strftime("%Y-%m")


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


def _pick_int(row: dict, *keys: str) -> int:
    for key in keys:
        value = row.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, (int, float)):
            return int(value)
    return 0


def _format_hour_label(hour: int) -> str:
    normalized = max(0, min(23, int(hour)))
    period = "AM" if normalized < 12 else "PM"
    hour12 = normalized % 12 or 12
    return f"{hour12} {period}"


def _format_log_timestamp(value: object) -> str:
    parsed = _parse_iso_datetime(value)
    if parsed is None:
        if isinstance(value, str) and value:
            return value
        return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    return parsed.astimezone().strftime("%Y-%m-%d %H:%M")


def _get_monthly_visitor_rows(month: str | None) -> list[dict]:
    if not is_supabase_available():
        return []

    client = get_supabase_client()
    if client is None:
        return []

    start, end, _ = _parse_month(month)
    try:
        result = (
            client.table("visitor_statistics")
            .select("date,hour,male_total,male_count,female_total,female_count,unknown_total,unknown_count")
            .gte("date", start.date().isoformat())
            .lt("date", end.date().isoformat())
            .limit(5000)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def _get_monthly_report_rows(month: str | None) -> list[dict]:
    if not is_supabase_available():
        return []

    client = get_supabase_client()
    if client is None:
        return []

    _, _, normalized_month = _parse_month(month)
    try:
        result = (
            client.table("report_submissions")
            .select("id,enterprise_id,period,status,submitted_at,submitted_by,notes,total_visitors,male_count,female_count")
            .eq("period", normalized_month)
            .order("submitted_at", desc=True)
            .limit(200)
            .execute()
        )
        return result.data or []
    except Exception:
        return []


def _get_enterprise_name_lookup() -> dict[str, str]:
    if not is_supabase_available():
        return {}

    client = get_supabase_client()
    if client is None:
        return {}

    try:
        result = client.table("enterprises").select("id,company_name").limit(1000).execute()
    except Exception:
        return {}

    lookup: dict[str, str] = {}
    for row in result.data or []:
        enterprise_id = row.get("id")
        company_name = row.get("company_name")
        if isinstance(enterprise_id, str) and isinstance(company_name, str):
            lookup[enterprise_id] = company_name
    return lookup


def get_overview_payload(month: str | None = None) -> dict:
    visitor_rows = _get_monthly_visitor_rows(month)
    report_rows = _get_monthly_report_rows(month)

    daily_totals: dict[str, int] = {}
    hourly_totals: dict[int, int] = {}
    total_visitors = 0

    for row in visitor_rows:
        male = _pick_int(row, "male_total", "male_count")
        female = _pick_int(row, "female_total", "female_count")
        unknown = _pick_int(row, "unknown_total", "unknown_count")
        row_total = max(0, male + female + unknown)
        total_visitors += row_total

        day = str(row.get("date") or "")
        if day:
            daily_totals[day] = daily_totals.get(day, 0) + row_total

        hour = row.get("hour")
        if isinstance(hour, int):
            hourly_totals[hour] = hourly_totals.get(hour, 0) + row_total

    # Tourist-specific telemetry is not currently persisted in schema.
    total_tourists = 0
    total_people_today = total_visitors + total_tourists
    currently_inside = 0

    if is_supabase_available():
        client = get_supabase_client()
        if client is not None:
            one_hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
            try:
                detection_result = (
                    client.table("detection_events")
                    .select("enterprise_id,track_id,timestamp")
                    .gte("timestamp", one_hour_ago)
                    .limit(2000)
                    .execute()
                )
                active_tracks: set[tuple[str, str]] = set()
                for item in detection_result.data or []:
                    enterprise_id = str(item.get("enterprise_id") or "")
                    track_id = str(item.get("track_id") or "")
                    if enterprise_id and track_id:
                        active_tracks.add((enterprise_id, track_id))
                currently_inside = len(active_tracks)
            except Exception:
                currently_inside = 0

    sorted_days = sorted(daily_totals.keys())
    recent_days = sorted_days[-7:]
    sparkline_visitors = [daily_totals[day] for day in recent_days]
    while len(sparkline_visitors) < 7:
        sparkline_visitors.insert(0, 0)

    sparkline_tourists = [0 for _ in sparkline_visitors]
    sparkline_total = [visitors for visitors in sparkline_visitors]
    sparkline_inside = [max(0, int(value * 0.08)) for value in sparkline_total]

    peak_hour = [
        {"time": _format_hour_label(hour), "value": hourly_totals[hour]}
        for hour in sorted(hourly_totals.keys())
    ]

    _, _, target_month = _parse_month(month)
    if report_rows or visitor_rows:
        recent_activities = [
            f"{len(report_rows)} report submissions recorded for {target_month}.",
            f"{total_visitors} total visitors aggregated from submitted telemetry.",
            "Overview metrics are sourced from Supabase live tables.",
        ]
    else:
        recent_activities = [
            f"No submissions recorded for {target_month}.",
            "No visitor statistics available yet.",
        ]

    return {
        "city": "San Pedro City, Laguna",
        "zip": "4023",
        "date": datetime.now().strftime("%A, %B %d, %Y"),
        "metrics": {
            "totalPeopleToday": total_people_today,
            "totalVisitors": total_visitors,
            "totalTourists": total_tourists,
            "currentlyInside": currently_inside,
        },
        "sparkline": {
            "totalPeopleToday": sparkline_total,
            "totalVisitors": sparkline_visitors,
            "totalTourists": sparkline_tourists,
            "currentlyInside": sparkline_inside,
        },
        "recentActivities": recent_activities,
        "peakHour": peak_hour,
    }


def get_reports_payload(month: str | None = None) -> dict:
    report_rows = _get_monthly_report_rows(month)
    enterprise_lookup = _get_enterprise_name_lookup()

    male_total = 0
    female_total = 0
    submitted_reports: list[dict] = []

    for row in report_rows:
        male_total += _pick_int(row, "male_count")
        female_total += _pick_int(row, "female_count")

        enterprise_id = str(row.get("enterprise_id") or "")
        business = enterprise_lookup.get(enterprise_id, enterprise_id or "Unknown Enterprise")
        report_id = str(row.get("id") or "") or f"rpt-{enterprise_id}"
        submitted_at = _format_log_timestamp(row.get("submitted_at"))
        status = str(row.get("status") or "SUBMITTED").title()
        submitted_by = str(row.get("submitted_by") or "enterprise_user")
        notes = str(row.get("notes") or "")

        submitted_reports.append(
            {
                "id": report_id,
                "business": business,
                "status": status,
                "type": "Monthly Report Submission",
                "submittedBy": submitted_by,
                "submittedAt": submitted_at,
                "summary": notes or "Submitted monthly report package.",
            }
        )

    demographics = []
    if male_total > 0 or female_total > 0:
        demographics = [
            {"name": "Male Residents", "value": male_total},
            {"name": "Female Residents", "value": female_total},
            {"name": "Male Tourists", "value": 0},
            {"name": "Female Tourists", "value": 0},
        ]

    return {
        "quarterlyVisitorDemographics": demographics,
        "submittedReports": submitted_reports,
    }


def get_logs_payload() -> list[dict]:
    if not is_supabase_available():
        return []

    client = get_supabase_client()
    if client is None:
        return []

    logs: list[dict] = []

    try:
        audit_rows = (
            client.table("audit_logs")
            .select("id,created_at,entity_type,entity_id,action,actor_type")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception:
        audit_rows = []

    for row in audit_rows:
        logs.append(
            {
                "id": str(row.get("id") or f"log-audit-{len(logs) + 1}"),
                "timestamp": _format_log_timestamp(row.get("created_at")),
                "source": str(row.get("actor_type") or "System"),
                "category": str(row.get("entity_type") or "Audit").title(),
                "message": f"{row.get('action') or 'UPDATED'} on {row.get('entity_id') or 'record'}",
                "severity": "Info",
            }
        )

    try:
        report_rows = (
            client.table("report_submissions")
            .select("id,enterprise_id,status,submitted_at")
            .order("submitted_at", desc=True)
            .limit(30)
            .execute()
            .data
            or []
        )
    except Exception:
        report_rows = []

    for row in report_rows:
        logs.append(
            {
                "id": str(row.get("id") or f"log-report-{len(logs) + 1}"),
                "timestamp": _format_log_timestamp(row.get("submitted_at")),
                "source": "Enterprise",
                "category": "Reports",
                "message": f"{row.get('enterprise_id') or 'enterprise'} submitted report with status {row.get('status') or 'SUBMITTED'}.",
                "severity": "Info",
            }
        )

    try:
        detection_rows = (
            client.table("detection_events")
            .select("id,enterprise_id,track_id,timestamp,sex")
            .order("timestamp", desc=True)
            .limit(30)
            .execute()
            .data
            or []
        )
    except Exception:
        detection_rows = []

    for row in detection_rows:
        sex = str(row.get("sex") or "unknown").title()
        logs.append(
            {
                "id": str(row.get("id") or f"log-detection-{len(logs) + 1}"),
                "timestamp": _format_log_timestamp(row.get("timestamp")),
                "source": str(row.get("enterprise_id") or "Enterprise"),
                "category": "Detection",
                "message": f"{sex} detection captured (track {row.get('track_id') or 'n/a'}).",
                "severity": "Info",
            }
        )

    logs.sort(key=lambda item: item.get("timestamp", ""), reverse=True)
    return logs[:100]


def get_enterprise_analytics(enterprise_id: int) -> dict | None:
    return core.ENTERPRISE_ANALYTICS.get(enterprise_id)


def build_default_analytics(enterprise_id: int) -> dict:
    return core.build_default_analytics(enterprise_id)
