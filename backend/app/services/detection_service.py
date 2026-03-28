"""
Detection service for processing and storing camera ML detections.
Handles batch inserts, real-time aggregation, and statistics.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.config import get_settings
from app.core.supabase import get_supabase_client, is_supabase_available
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


def insert_unified_detection_events(
    batch: UnifiedDetectionBatchRequest,
) -> UnifiedDetectionBatchResponse:
    """
    Insert a batch of unified (deduplicated) person events.
    Updates existing person records or inserts new ones.
    """
    if not is_supabase_available():
        return UnifiedDetectionBatchResponse(
            inserted_count=len(batch.events),
            message="Stored in memory (Supabase not configured)",
        )

    client = get_supabase_client()
    inserted = 0
    updated = 0
    failed = 0

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
            print(f"Error processing unified event {event.person_id}: {e}")
            failed += 1

    # Update aggregated statistics
    _update_unified_statistics(batch.events)

    return UnifiedDetectionBatchResponse(
        inserted_count=inserted,
        updated_count=updated,
        failed_count=failed,
        message="Success" if failed == 0 else f"Partial failure: {failed} events failed",
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
                "male_total": 0,
                "female_total": 0,
                "unknown_total": 0,
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
            agg["male_total"] += 1
        elif event.gender == GenderType.FEMALE:
            agg["female_total"] += 1
        else:
            agg["unknown_total"] += 1

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

            dedup_stats = {
                "total_tracks": sum(len(e.track_ids) for e in events if e.enterprise_id == enterprise_id),
                "unique_persons": unique_count,
                "reid_by_geometric": counts["reid_geometric"],
                "reid_by_appearance": counts["reid_appearance"],
                "reid_by_face": counts["reid_face"],
            }

            if existing.data:
                record = existing.data[0]
                updates = {
                    "male_total": record.get("male_total", 0) + counts["male_total"],
                    "female_total": record.get("female_total", 0) + counts["female_total"],
                    "unknown_total": record.get("unknown_total", 0) + counts["unknown_total"],
                    "unique_visitors": record.get("unique_visitors", 0) + unique_count,
                    "avg_dwell_seconds": avg_dwell,
                    "dedup_stats": dedup_stats,
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
                    "unique_visitors": unique_count,
                    "avg_dwell_seconds": avg_dwell,
                    "dedup_stats": dedup_stats,
                }
                client.table("visitor_statistics").insert(new_record).execute()

        except Exception as e:
            print(f"Error updating unified statistics for {key}: {e}")


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
    """
    if not is_supabase_available():
        return DeduplicationStats(
            total_tracks=100,
            unique_persons=65,
            reid_success_count=35,
            reid_by_geometric=15,
            reid_by_appearance=12,
            reid_by_face=8,
            dedup_ratio=0.35,
        )

    client = get_supabase_client()
    target_date = date or datetime.now().strftime("%Y-%m-%d")

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
        print(f"Error getting deduplication stats: {e}")
        return DeduplicationStats()


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
        total_tracks = male + female + random.randint(10, 30)
        unique = male + female
        
        stats.append(
            VisitorStatistics(
                enterprise_id=enterprise_id,
                date=target_date,
                hour=hour,
                male_total=male,
                female_total=female,
                unknown_total=random.randint(0, 5),
                unique_visitors=unique,
                avg_dwell_seconds=random.randint(60, 600),
                dedup_stats=DeduplicationStats(
                    total_tracks=total_tracks,
                    unique_persons=unique,
                    reid_success_count=total_tracks - unique,
                    reid_by_geometric=random.randint(5, 15),
                    reid_by_appearance=random.randint(3, 10),
                    reid_by_face=random.randint(1, 5),
                    dedup_ratio=1 - (unique / total_tracks) if total_tracks > 0 else 0,
                ),
            )
        )

    return stats
