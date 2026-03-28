"""
Detection service for processing and storing camera ML detections.
Handles batch inserts, real-time aggregation, and statistics.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import get_settings
from app.core.supabase import get_supabase_client, is_supabase_available
from app.schemas.detection import (
    DetectionBatchRequest,
    DetectionBatchResponse,
    DetectionEventCreate,
    GenderType,
    VisitorStatistics,
)


def insert_detection_events(batch: DetectionBatchRequest) -> DetectionBatchResponse:
    """
    Insert a batch of detection events into the database.
    Falls back to in-memory storage if Supabase is not configured.
    """
    if not is_supabase_available():
        # In-memory fallback for development
        return DetectionBatchResponse(
            inserted_count=len(batch.events),
            message="Stored in memory (Supabase not configured)",
        )

    client = get_supabase_client()
    inserted = 0
    failed = 0

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
                "bbox_x": int(event.bbox_x),
                "bbox_y": int(event.bbox_y),
                "bbox_w": int(event.bbox_w),
                "bbox_h": int(event.bbox_h),
                "dwell_seconds": event.dwell_seconds,
                "first_seen": event.first_seen.isoformat(),
            }
            for event in batch.events
        ]

        result = client.table("detection_events").insert(records).execute()
        inserted = len(result.data) if result.data else 0
        failed = len(batch.events) - inserted

    except Exception as e:
        print(f"Error inserting detection events: {e}")
        failed = len(batch.events)

    return DetectionBatchResponse(
        inserted_count=inserted,
        failed_count=failed,
        message="Success" if failed == 0 else f"Partial failure: {failed} events failed",
    )


def get_visitor_statistics(
    enterprise_id: str,
    date: Optional[str] = None,
    hour: Optional[int] = None,
) -> list[VisitorStatistics]:
    """
    Get visitor statistics for an enterprise.
    Falls back to mock data if Supabase is not configured.
    """
    if not is_supabase_available():
        # Return mock statistics for development
        return _generate_mock_statistics(enterprise_id, date)

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
            male_total=row.get("male_total", 0),
            female_total=row.get("female_total", 0),
            unknown_total=row.get("unknown_total", 0),
            unique_visitors=row.get("unique_visitors", 0),
            avg_dwell_seconds=row.get("avg_dwell_seconds"),
        )
        for row in (result.data or [])
    ]


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
                updates["male_total"] = record.get("male_total", 0) + 1
            elif event.sex == GenderType.FEMALE:
                updates["female_total"] = record.get("female_total", 0) + 1
            else:
                updates["unknown_total"] = record.get("unknown_total", 0) + 1

            client.table("visitor_statistics").update(updates).eq("id", record["id"]).execute()
        else:
            # Insert new record
            new_record = {
                "enterprise_id": event.enterprise_id,
                "date": date_str,
                "hour": hour,
                "male_total": 1 if event.sex == GenderType.MALE else 0,
                "female_total": 1 if event.sex == GenderType.FEMALE else 0,
                "unknown_total": 1 if event.sex == GenderType.UNKNOWN else 0,
                "unique_visitors": 1,
            }
            client.table("visitor_statistics").insert(new_record).execute()

    except Exception as e:
        print(f"Error updating visitor statistics: {e}")


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
                "male_total": 0,
                "female_total": 0,
                "unknown_total": 0,
            }
            unique_tracks[key] = set()

        if event.sex == GenderType.MALE:
            aggregates[key]["male_total"] += 1
        elif event.sex == GenderType.FEMALE:
            aggregates[key]["female_total"] += 1
        else:
            aggregates[key]["unknown_total"] += 1

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
                    "male_total": record.get("male_total", 0) + counts["male_total"],
                    "female_total": record.get("female_total", 0) + counts["female_total"],
                    "unknown_total": record.get("unknown_total", 0) + counts["unknown_total"],
                    "unique_visitors": record.get("unique_visitors", 0) + len(unique_tracks[key]),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                client.table("visitor_statistics").update(updates).eq("id", record["id"]).execute()
            else:
                new_record = {
                    "enterprise_id": enterprise_id,
                    "date": date_str,
                    "hour": hour,
                    "male_total": counts["male_total"],
                    "female_total": counts["female_total"],
                    "unknown_total": counts["unknown_total"],
                    "unique_visitors": len(unique_tracks[key]),
                }
                client.table("visitor_statistics").insert(new_record).execute()

        except Exception as e:
            print(f"Error aggregating statistics for {key}: {e}")


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
        print(f"Error cleaning up old detections: {e}")
        return 0


def _generate_mock_statistics(enterprise_id: str, date: Optional[str] = None) -> list[VisitorStatistics]:
    """Generate mock statistics for development."""
    import random

    target_date = date or datetime.now().strftime("%Y-%m-%d")
    stats = []

    for hour in range(8, 22):  # 8 AM to 10 PM
        male = random.randint(5, 30)
        female = random.randint(5, 30)
        stats.append(
            VisitorStatistics(
                enterprise_id=enterprise_id,
                date=target_date,
                hour=hour,
                male_total=male,
                female_total=female,
                unknown_total=random.randint(0, 5),
                unique_visitors=male + female,
                avg_dwell_seconds=random.randint(60, 600),
            )
        )

    return stats
