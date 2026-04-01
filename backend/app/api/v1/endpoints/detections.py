"""
Detection API endpoints for camera ML processing.
Handles detection event ingestion and statistics retrieval.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas.detection import (
    CameraLogRecord,
    DeduplicationStats,
    DetectionBatchRequest,
    DetectionBatchResponse,
    RecentDetectionFeedEvent,
    UnifiedDetectionBatchRequest,
    UnifiedDetectionBatchResponse,
    VisitorStatistics,
)
from app.services import detection_service

router = APIRouter(prefix="/detections", tags=["Detections"])


@router.post("/batch", response_model=DetectionBatchResponse)
async def create_detection_batch(batch: DetectionBatchRequest):
    """
    Insert a batch of detection events from camera ML processing.
    
    Events are stored in the database and used to update aggregated statistics.
    Maximum batch size is 100 events.
    """
    result = detection_service.insert_detection_events(batch)

    # Only aggregate if persistence succeeded for the submitted batch.
    if result.failed_count == 0 and result.inserted_count > 0:
        detection_service.aggregate_statistics_batch(batch.events)
    
    return result


@router.post("/unified", response_model=UnifiedDetectionBatchResponse)
async def create_unified_detection_batch(batch: UnifiedDetectionBatchRequest):
    """
    Insert a batch of deduplicated person events.
    
    This endpoint receives unified person identities after deduplication
    on the frontend. Each event represents a unique person with all their
    associated track IDs merged.
    
    Features:
    - Upserts person records (updates existing or inserts new)
    - Tracks re-identification method and confidence
    - Updates aggregated statistics with deduplication metrics
    
    Maximum batch size is 100 events.
    """
    return detection_service.insert_unified_detection_events(batch)


@router.get("/statistics", response_model=list[VisitorStatistics])
async def get_visitor_statistics(
    enterprise_id: str = Query(..., description="Enterprise ID"),
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD)"),
    hour: Optional[int] = Query(None, ge=0, le=23, description="Hour (0-23)"),
):
    """
    Get aggregated visitor statistics for an enterprise.
    
    Returns hourly breakdown of male, female, and unknown visitors.
    Includes deduplication statistics when available.
    """
    return detection_service.get_visitor_statistics(enterprise_id, date, hour)


@router.get("/dedup-stats", response_model=DeduplicationStats)
async def get_deduplication_statistics(
    enterprise_id: str = Query(..., description="Enterprise ID"),
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD)"),
):
    """
    Get deduplication effectiveness statistics for an enterprise.
    
    Returns metrics showing how many raw tracks were deduplicated
    into unique persons, and which re-identification methods were used.
    """
    return detection_service.get_deduplication_stats(enterprise_id, date)


@router.post("/cleanup")
async def cleanup_old_detections():
    """
    Remove detection events older than the retention period.
    
    This endpoint should be called periodically (e.g., daily via cron).
    """
    deleted_count = detection_service.cleanup_old_detections()
    return {
        "deleted_count": deleted_count,
        "message": f"Cleaned up {deleted_count} old detection events",
    }


@router.get("/recent", response_model=list[RecentDetectionFeedEvent])
async def get_recent_detection_feed(
    enterprise_id: str = Query(..., description="Enterprise ID"),
    month: Optional[str] = Query(None, description="Month filter (YYYY-MM)"),
    limit: int = Query(24, ge=1, le=200, description="Maximum rows to return"),
):
    """
    Return recent detection feed rows from DB for monitoring logs.
    """
    return detection_service.get_recent_detection_feed(enterprise_id, month, limit)


@router.get("/camera-logs", response_model=list[CameraLogRecord])
async def get_camera_logs(
    enterprise_id: str = Query(..., description="Enterprise ID"),
    month: Optional[str] = Query(None, description="Month filter (YYYY-MM)"),
    limit: int = Query(500, ge=1, le=1000, description="Maximum rows to return"),
):
    """
    Return camera log sessions sourced from DB detection events.
    """
    return detection_service.get_camera_log_sessions(enterprise_id, month, limit)
