"""
Detection service for processing and storing camera ML detections.
Handles batch inserts, real-time aggregation, and statistics.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import get_settings
from app.core.supabase import get_supabase_client, is_supabase_available
from app.state import runtime_store
from app.schemas.detection import (
    DeduplicationStats,
    DetectionBatchRequest,
    DetectionBatchResponse,
    DetectionEventCreate,
    GenderType,
    ReIdentificationMethod,
    UnifiedDetectionBatchRequest,
    UnifiedDetectionBatchResponse,
    UnifiedDetectionEvent,
    VisitorStatistics,
)
from domain_exceptions import DomainServiceUnavailableError


logger = logging.getLogger(__name__)
_UNIFIED_TABLE_AVAILABLE: Optional[bool] = None


def _month_bounds_utc(month: str) -> tuple[datetime, datetime]:
    start = datetime.strptime(month, "%Y-%m").replace(tzinfo=timezone.utc)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None

    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)

    return dt.astimezone(timezone.utc)


def _extract_error_metadata(error: Exception) -> tuple[str, str]:
    """Extract PostgREST-like error code/message from generic exceptions."""
    error_code = ""
    error_message = str(error)

    raw = error.args[0] if error.args else None
    if isinstance(raw, dict):
        maybe_code = raw.get("code")
        maybe_message = raw.get("message")
        if isinstance(maybe_code, str):
            error_code = maybe_code
        if isinstance(maybe_message, str) and maybe_message:
            error_message = maybe_message

    return error_code.upper(), error_message


def _is_missing_unified_table_error(error: Exception) -> bool:
    """Return True when unified_detections table is missing from active schema cache."""
    error_code, error_message = _extract_error_metadata(error)
    lowered = error_message.lower()
    return error_code in {"PGRST205", "42P01"} or (
        "unified_detections" in lowered and "could not find the table" in lowered
    )


def _is_camera_fk_error(error: Exception) -> bool:
    """Return True for foreign-key failures against detection_events.camera_id."""
    error_code, error_message = _extract_error_metadata(error)
    lowered = error_message.lower()
    return error_code == "23503" or (
        "detection_events_camera_id_fkey" in lowered
        or "key (camera_id)" in lowered
    )


def _is_unified_detections_available(client) -> bool:
    """Probe unified table availability once and cache result for this process."""
    global _UNIFIED_TABLE_AVAILABLE

    if _UNIFIED_TABLE_AVAILABLE is not None:
        return _UNIFIED_TABLE_AVAILABLE

    try:
        client.table("unified_detections").select("id").limit(1).execute()
        _UNIFIED_TABLE_AVAILABLE = True
    except Exception as error:
        if _is_missing_unified_table_error(error):
            logger.warning("Unified detections table is unavailable in active schema cache")
            _UNIFIED_TABLE_AVAILABLE = False
        else:
            logger.warning("Unified detections availability probe failed: %s", error)
            _UNIFIED_TABLE_AVAILABLE = False

    return bool(_UNIFIED_TABLE_AVAILABLE)


def _append_runtime_detection_events(events: list[DetectionEventCreate]) -> None:
    for event in events:
        stamp = event.timestamp.astimezone().strftime("%I:%M:%S %p")
        detail = f"{event.sex.value.title()} detection | Track {event.track_id} | Dwell {event.dwell_seconds}s | {stamp}"
        runtime_store.append_camera_event(event.enterprise_id, detail)


def _append_runtime_unified_events(events: list[UnifiedDetectionEvent]) -> None:
    for event in events:
        stamp = event.last_seen.astimezone().strftime("%I:%M:%S %p")
        detail = f"{event.gender.value.title()} person | ID {event.person_id} | Dwell {event.total_dwell_seconds}s | {stamp}"
        runtime_store.append_camera_event(event.enterprise_id, detail)


def insert_detection_events(batch: DetectionBatchRequest) -> DetectionBatchResponse:
    """
    Insert a batch of detection events into the database.
    Returns explicit service unavailable error if Supabase is not configured.
    """
    if not is_supabase_available():
        raise DomainServiceUnavailableError(
            "Database service unavailable. Detection events cannot be persisted."
        )

    client = get_supabase_client()
    inserted = 0
    failed = 0
    error_summary: Optional[str] = None

    try:
        records = [
            {
                "enterprise_id": event.enterprise_id,
                "camera_id": event.camera_id,
                "track_id": event.track_id,
                "timestamp": event.timestamp.isoformat(),
                "sex": event.sex.value,
                "confidence_person": event.confidence_person,
                "confidence_sex": event.confidence_sex,
                "dwell_seconds": event.dwell_seconds,
            }
            for event in batch.events
        ]

        try:
            result = client.table("detection_events").insert(records).execute()
        except Exception as insert_error:
            if not _is_camera_fk_error(insert_error):
                raise

            logger.warning(
                "camera_id foreign-key mismatch detected; retrying detection insert with null camera_id"
            )
            for record in records:
                record["camera_id"] = None
            result = client.table("detection_events").insert(records).execute()

        inserted = len(result.data) if result.data else 0
        failed = len(batch.events) - inserted

        if inserted > 0:
            _append_runtime_detection_events(batch.events)

    except Exception as e:
        error_code, error_message = _extract_error_metadata(e)
        error_summary = f"{error_code}: {error_message}" if error_code else error_message
        logger.exception("Error inserting detection events")
        failed = len(batch.events)

    return DetectionBatchResponse(
        inserted_count=inserted,
        failed_count=failed,
        message="Success" if failed == 0 else f"Partial failure: {failed} events failed",
        error_summary=error_summary,
    )


def insert_unified_detection_events(
    batch: UnifiedDetectionBatchRequest,
) -> UnifiedDetectionBatchResponse:
    """
    Insert a batch of unified (deduplicated) person events.
    Updates existing person records or inserts new ones.
    Returns explicit service unavailable error if Supabase is not configured.
    """
    if not is_supabase_available():
        raise DomainServiceUnavailableError(
            "Database service unavailable. Unified detection events cannot be persisted."
        )

    client = get_supabase_client()

    if not _is_unified_detections_available(client):
        return UnifiedDetectionBatchResponse(
            inserted_count=0,
            updated_count=0,
            failed_count=len(batch.events),
            message="Unified detection persistence unavailable in current schema.",
            error_summary="PGRST205: unified_detections table is missing from Supabase schema cache.",
        )

    inserted = 0
    updated = 0
    failed = 0
    error_summary: Optional[str] = None

    for event in batch.events:
        try:
            record = _unified_event_to_record(event)

            # Check if person already exists
            existing = (
                client.table("unified_detections")
                .select("id, total_dwell_seconds, reid_count")
                .eq("person_id", event.person_id)
                .eq("enterprise_id", event.enterprise_id)
                .execute()
            )

            if existing.data:
                # Update existing record
                existing_record = existing.data[0]
                record["total_dwell_seconds"] = max(
                    existing_record.get("total_dwell_seconds", 0),
                    event.total_dwell_seconds,
                )
                record["updated_at"] = datetime.now(timezone.utc).isoformat()

                client.table("unified_detections").update(record).eq(
                    "id", existing_record["id"]
                ).execute()
                updated += 1
            else:
                # Insert new record
                record["created_at"] = datetime.now(timezone.utc).isoformat()
                client.table("unified_detections").insert(record).execute()
                inserted += 1

        except Exception as e:
            if _is_missing_unified_table_error(e):
                return UnifiedDetectionBatchResponse(
                    inserted_count=inserted,
                    updated_count=updated,
                    failed_count=failed + (len(batch.events) - inserted - updated),
                    message="Unified detection persistence unavailable in current schema.",
                    error_summary="PGRST205: unified_detections table is missing from Supabase schema cache.",
                )

            error_code, error_message = _extract_error_metadata(e)
            error_summary = f"{error_code}: {error_message}" if error_code else error_message
            logger.exception("Error processing unified event %s", event.person_id)
            failed += 1

    # Update aggregated statistics
    _update_unified_statistics(batch.events)
    if inserted > 0 or updated > 0:
        _append_runtime_unified_events(batch.events)

    return UnifiedDetectionBatchResponse(
        inserted_count=inserted,
        updated_count=updated,
        failed_count=failed,
        message="Success" if failed == 0 else f"Partial failure: {failed} events failed",
        error_summary=error_summary,
    )


def _unified_event_to_record(event: UnifiedDetectionEvent) -> dict:
    """Convert a UnifiedDetectionEvent to a database record."""
    return {
        "enterprise_id": event.enterprise_id,
        "camera_id": event.camera_id,
        "person_id": event.person_id,
        "track_ids": event.track_ids,
        "first_seen": event.first_seen.isoformat(),
        "last_seen": event.last_seen.isoformat(),
        "total_dwell_seconds": event.total_dwell_seconds,
        "gender": event.gender.value,
        "gender_confidence": event.gender_confidence,
        "reid_method": event.reid_method.value,
        "reid_confidence": event.reid_confidence,
        "last_bbox_x": event.last_bbox_x,
        "last_bbox_y": event.last_bbox_y,
        "last_bbox_w": event.last_bbox_w,
        "last_bbox_h": event.last_bbox_h,
    }


def _update_unified_statistics(events: list[UnifiedDetectionEvent]) -> None:
    """Update visitor statistics based on unified detection events."""
    if not is_supabase_available() or not events:
        return

    # Group by enterprise, date, hour
    aggregates: dict[tuple, dict] = {}

    for event in events:
        date_str = event.last_seen.strftime("%Y-%m-%d")
        hour = event.last_seen.hour
        key = (event.enterprise_id, date_str, hour)

        if key not in aggregates:
            aggregates[key] = {
                "male_count": 0,
                "female_count": 0,
                "unknown_count": 0,
                "unique_persons": set(),
                "total_dwell": 0,
                "reid_geometric": 0,
                "reid_appearance": 0,
                "reid_face": 0,
            }

        agg = aggregates[key]
        agg["unique_persons"].add(event.person_id)
        agg["total_dwell"] += event.total_dwell_seconds

        if event.gender == GenderType.MALE:
            agg["male_count"] += 1
        elif event.gender == GenderType.FEMALE:
            agg["female_count"] += 1
        else:
            agg["unknown_count"] += 1

        if event.reid_method == ReIdentificationMethod.GEOMETRIC:
            agg["reid_geometric"] += 1
        elif event.reid_method == ReIdentificationMethod.APPEARANCE:
            agg["reid_appearance"] += 1
        elif event.reid_method == ReIdentificationMethod.FACE:
            agg["reid_face"] += 1

    # Update database
    client = get_supabase_client()
    for key, counts in aggregates.items():
        enterprise_id, date_str, hour = key
        unique_count = len(counts["unique_persons"])
        avg_dwell = counts["total_dwell"] // unique_count if unique_count > 0 else 0

        try:
            existing = (
                client.table("visitor_statistics")
                .select("*")
                .eq("enterprise_id", enterprise_id)
                .eq("date", date_str)
                .eq("hour", hour)
                .execute()
            )

            if existing.data:
                record = existing.data[0]
                updates = {
                    "male_count": record.get("male_count", 0) + counts["male_count"],
                    "female_count": record.get("female_count", 0) + counts["female_count"],
                    "unknown_count": record.get("unknown_count", 0) + counts["unknown_count"],
                    "unique_visitors": record.get("unique_visitors", 0) + unique_count,
                    "avg_dwell_seconds": avg_dwell,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                client.table("visitor_statistics").update(updates).eq("id", record["id"]).execute()
            else:
                new_record = {
                    "enterprise_id": enterprise_id,
                    "date": date_str,
                    "hour": hour,
                    "male_count": counts["male_count"],
                    "female_count": counts["female_count"],
                    "unknown_count": counts["unknown_count"],
                    "unique_visitors": unique_count,
                    "avg_dwell_seconds": avg_dwell,
                }
                client.table("visitor_statistics").insert(new_record).execute()

        except Exception as e:
            logger.exception("Error updating unified statistics for %s", key)


def get_visitor_statistics(
    enterprise_id: str,
    date: Optional[str] = None,
    hour: Optional[int] = None,
) -> list[VisitorStatistics]:
    """
    Get visitor statistics for an enterprise.
    Returns explicit empty list when Supabase is not configured - no mock data fallback.
    """
    if not is_supabase_available():
        # Return empty list with service unavailable indication
        # Statistical test data should be seeded via seed_statistical_mock_data.py script
        return []

    client = get_supabase_client()
    query = client.table("visitor_statistics").select("*").eq("enterprise_id", enterprise_id)

    if date:
        query = query.eq("date", date)
    if hour is not None:
        query = query.eq("hour", hour)

    result = query.order("date", desc=True).order("hour").limit(100).execute()

    return [
        VisitorStatistics(
            enterprise_id=row["enterprise_id"],
            date=row["date"],
            hour=row.get("hour"),
            male_total=row.get("male_total", row.get("male_count", 0)),
            female_total=row.get("female_total", row.get("female_count", 0)),
            unknown_total=row.get("unknown_total", row.get("unknown_count", 0)),
            unique_visitors=row.get("unique_visitors", 0),
            avg_dwell_seconds=row.get("avg_dwell_seconds"),
            dedup_stats=DeduplicationStats(**row["dedup_stats"]) if row.get("dedup_stats") else None,
        )
        for row in (result.data or [])
    ]


def get_deduplication_stats(
    enterprise_id: str,
    date: Optional[str] = None,
) -> DeduplicationStats:
    """
    Get deduplication statistics for an enterprise.
    Returns empty stats when Supabase is unavailable - no mock data fallback.
    """
    if not is_supabase_available():
        # Return empty stats - statistical test data should be seeded via script
        return DeduplicationStats(warning="Unified deduplication metrics unavailable: database service is offline.")

    client = get_supabase_client()
    target_date = date or datetime.now().strftime("%Y-%m-%d")

    if not _is_unified_detections_available(client):
        return DeduplicationStats(
            warning="Unified deduplication metrics unavailable: unified_detections table is not present in current schema."
        )

    try:
        result = (
            client.table("unified_detections")
            .select("person_id, track_ids, reid_method")
            .eq("enterprise_id", enterprise_id)
            .gte("first_seen", f"{target_date}T00:00:00")
            .lt("first_seen", f"{target_date}T23:59:59")
            .execute()
        )

        if not result.data:
            return DeduplicationStats()

        total_tracks = sum(len(row.get("track_ids", [])) for row in result.data)
        unique_persons = len(result.data)
        reid_geometric = sum(1 for row in result.data if row.get("reid_method") == "geometric")
        reid_appearance = sum(1 for row in result.data if row.get("reid_method") == "appearance")
        reid_face = sum(1 for row in result.data if row.get("reid_method") == "face")
        reid_total = reid_geometric + reid_appearance + reid_face

        return DeduplicationStats(
            total_tracks=total_tracks,
            unique_persons=unique_persons,
            reid_success_count=reid_total,
            reid_by_geometric=reid_geometric,
            reid_by_appearance=reid_appearance,
            reid_by_face=reid_face,
            dedup_ratio=1 - (unique_persons / total_tracks) if total_tracks > 0 else 0,
        )

    except Exception as e:
        logger.exception("Error getting deduplication stats")
        return DeduplicationStats(
            warning="Unified deduplication metrics unavailable due to a temporary backend read error."
        )


def update_visitor_statistics(event: DetectionEventCreate) -> None:
    """
    Update aggregated visitor statistics based on a detection event.
    Called after inserting detection events.
    """
    if not is_supabase_available():
        return

    client = get_supabase_client()
    date_str = event.timestamp.strftime("%Y-%m-%d")
    hour = event.timestamp.hour

    # Upsert statistics
    try:
        # Check if record exists
        existing = (
            client.table("visitor_statistics")
            .select("*")
            .eq("enterprise_id", event.enterprise_id)
            .eq("date", date_str)
            .eq("hour", hour)
            .execute()
        )

        if existing.data:
            # Update existing record
            record = existing.data[0]
            updates = {
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

            if event.sex == GenderType.MALE:
                updates["male_count"] = record.get("male_count", 0) + 1
            elif event.sex == GenderType.FEMALE:
                updates["female_count"] = record.get("female_count", 0) + 1
            else:
                updates["unknown_count"] = record.get("unknown_count", 0) + 1

            client.table("visitor_statistics").update(updates).eq("id", record["id"]).execute()
        else:
            # Insert new record
            new_record = {
                "enterprise_id": event.enterprise_id,
                "date": date_str,
                "hour": hour,
                "male_count": 1 if event.sex == GenderType.MALE else 0,
                "female_count": 1 if event.sex == GenderType.FEMALE else 0,
                "unknown_count": 1 if event.sex == GenderType.UNKNOWN else 0,
                "unique_visitors": 1,
            }
            client.table("visitor_statistics").insert(new_record).execute()

    except Exception as e:
        logger.exception("Error updating visitor statistics")


def aggregate_statistics_batch(events: list[DetectionEventCreate]) -> None:
    """
    Aggregate statistics for a batch of events.
    More efficient than updating one by one.
    """
    if not is_supabase_available() or not events:
        return

    # Group events by enterprise, date, hour
    aggregates: dict[tuple, dict] = {}
    unique_tracks: dict[tuple, set] = {}

    for event in events:
        date_str = event.timestamp.strftime("%Y-%m-%d")
        hour = event.timestamp.hour
        key = (event.enterprise_id, date_str, hour)

        if key not in aggregates:
            aggregates[key] = {
                "male_count": 0,
                "female_count": 0,
                "unknown_count": 0,
            }
            unique_tracks[key] = set()

        if event.sex == GenderType.MALE:
            aggregates[key]["male_count"] += 1
        elif event.sex == GenderType.FEMALE:
            aggregates[key]["female_count"] += 1
        else:
            aggregates[key]["unknown_count"] += 1

        unique_tracks[key].add(event.track_id)

    # Update each aggregate
    client = get_supabase_client()
    for key, counts in aggregates.items():
        enterprise_id, date_str, hour = key
        try:
            existing = (
                client.table("visitor_statistics")
                .select("*")
                .eq("enterprise_id", enterprise_id)
                .eq("date", date_str)
                .eq("hour", hour)
                .execute()
            )

            if existing.data:
                record = existing.data[0]
                updates = {
                    "male_count": record.get("male_count", 0) + counts["male_count"],
                    "female_count": record.get("female_count", 0) + counts["female_count"],
                    "unknown_count": record.get("unknown_count", 0) + counts["unknown_count"],
                    "unique_visitors": record.get("unique_visitors", 0) + len(unique_tracks[key]),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                client.table("visitor_statistics").update(updates).eq("id", record["id"]).execute()
            else:
                new_record = {
                    "enterprise_id": enterprise_id,
                    "date": date_str,
                    "hour": hour,
                    "male_count": counts["male_count"],
                    "female_count": counts["female_count"],
                    "unknown_count": counts["unknown_count"],
                    "unique_visitors": len(unique_tracks[key]),
                }
                client.table("visitor_statistics").insert(new_record).execute()

        except Exception as e:
            logger.exception("Error aggregating statistics for %s", key)


def cleanup_old_detections() -> int:
    """
    Remove detection events older than the retention period.
    Returns the number of deleted records.
    """
    if not is_supabase_available():
        return 0

    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.detection_retention_days)

    client = get_supabase_client()
    try:
        result = (
            client.table("detection_events")
            .delete()
            .lt("timestamp", cutoff.isoformat())
            .execute()
        )
        return len(result.data) if result.data else 0
    except Exception as e:
        logger.exception("Error cleaning up old detections")
        return 0


def get_recent_detection_feed(
    enterprise_id: str,
    month: Optional[str] = None,
    limit: int = 24,
) -> list[dict]:
    """
    Return recent detection feed rows from database for monitoring surfaces.
    """
    if not is_supabase_available():
        return []

    client = get_supabase_client()
    if client is None:
        return []

    bounded_limit = min(max(limit, 1), 200)
    query = (
        client.table("detection_events")
        .select("track_id,timestamp,sex,dwell_seconds")
        .eq("enterprise_id", enterprise_id)
    )

    if month:
        try:
            start, end = _month_bounds_utc(month)
            query = query.gte("timestamp", start.isoformat()).lt("timestamp", end.isoformat())
        except ValueError:
            return []

    try:
        result = query.order("timestamp", desc=True).limit(bounded_limit).execute()
    except Exception as error:
        logger.exception("Error loading recent detection feed")
        return []

    rows = result.data or []
    feed_rows: list[dict] = []
    total_rows = len(rows)

    for index, row in enumerate(rows):
        time_iso = str(row.get("timestamp") or "")
        parsed_time = _parse_iso_datetime(time_iso)
        if not parsed_time:
            continue

        track_id = str(row.get("track_id") or f"track-{index + 1}")
        sex_value = str(row.get("sex") or "unknown").title()
        dwell_seconds = int(row.get("dwell_seconds") or 0)
        feed_rows.append(
            {
                "id": f"{track_id}-{parsed_time.isoformat()}",
                "time_iso": parsed_time.isoformat(),
                "frame": max(1, total_rows - index),
                "details": f"{sex_value} detection | Track {track_id} | Dwell {dwell_seconds}s",
            }
        )

    return feed_rows


def get_camera_log_sessions(
    enterprise_id: str,
    month: Optional[str] = None,
    limit: int = 500,
) -> list[dict]:
    """
    Build camera log session rows from DB detection events.
    """
    if not is_supabase_available():
        return []

    client = get_supabase_client()
    if client is None:
        return []

    bounded_limit = min(max(limit, 1), 1000)
    fetch_limit = min(max(bounded_limit * 12, 240), 5000)

    query = (
        client.table("detection_events")
        .select("track_id,timestamp,sex,dwell_seconds")
        .eq("enterprise_id", enterprise_id)
    )

    if month:
        try:
            start, end = _month_bounds_utc(month)
            query = query.gte("timestamp", start.isoformat()).lt("timestamp", end.isoformat())
        except ValueError:
            return []

    try:
        result = query.order("timestamp", desc=True).limit(fetch_limit).execute()
    except Exception as error:
        logger.exception("Error loading camera log sessions")
        return []

    rows = result.data or []
    grouped: dict[str, dict] = {}

    for row in rows:
        track_id = str(row.get("track_id") or "")
        if not track_id:
            continue

        timestamp = _parse_iso_datetime(str(row.get("timestamp") or ""))
        first_seen = timestamp
        if not timestamp:
            continue

        entry = grouped.get(track_id)
        if entry is None:
            entry = {
                "track_id": track_id,
                "time_in": first_seen,
                "time_out": timestamp,
                "male": 0,
                "female": 0,
                "unknown": 0,
                "max_dwell": 0,
            }
            grouped[track_id] = entry

        if first_seen < entry["time_in"]:
            entry["time_in"] = first_seen
        if timestamp > entry["time_out"]:
            entry["time_out"] = timestamp

        sex_value = str(row.get("sex") or "unknown")
        if sex_value == "male":
            entry["male"] += 1
        elif sex_value == "female":
            entry["female"] += 1
        else:
            entry["unknown"] += 1

        dwell_seconds = int(row.get("dwell_seconds") or 0)
        if dwell_seconds > entry["max_dwell"]:
            entry["max_dwell"] = dwell_seconds

    sessions: list[dict] = []
    sorted_entries = sorted(grouped.values(), key=lambda item: item["time_in"], reverse=True)

    for index, entry in enumerate(sorted_entries[:bounded_limit]):
        elapsed_seconds = int((entry["time_out"] - entry["time_in"]).total_seconds())
        duration_seconds = max(elapsed_seconds, int(entry["max_dwell"]))
        duration_hours = round(duration_seconds / 3600, 2)
        classification = "Tourist" if duration_hours >= 8 else "Visitor"

        male_events = int(entry["male"])
        female_events = int(entry["female"])
        unknown_events = int(entry["unknown"])
        male_count = 1 if male_events >= female_events and male_events >= unknown_events else 0
        female_count = 1 if female_events > male_events and female_events >= unknown_events else 0

        sessions.append(
            {
                "id": f"{entry['track_id']}-{index + 1}",
                "unique_id": entry["track_id"],
                "time_in_iso": entry["time_in"].isoformat(),
                "time_out_iso": entry["time_out"].isoformat(),
                "duration_hours": duration_hours,
                "classification": classification,
                "male_count": male_count,
                "female_count": female_count,
                "total_count": 1,
            }
        )

    return sessions
