"""
Detection API endpoints for camera ML processing.
Handles detection event ingestion and statistics retrieval.
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.schemas.detection import (
    DetectionBatchRequest,
    DetectionBatchResponse,
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
    
    # Update aggregated statistics
    detection_service.aggregate_statistics_batch(batch.events)
    
    return result


@router.get("/statistics", response_model=list[VisitorStatistics])
async def get_visitor_statistics(
    enterprise_id: str = Query(..., description="Enterprise ID"),
    date: Optional[str] = Query(None, description="Date (YYYY-MM-DD)"),
    hour: Optional[int] = Query(None, ge=0, le=23, description="Hour (0-23)"),
):
    """
    Get aggregated visitor statistics for an enterprise.
    
    Returns hourly breakdown of male, female, and unknown visitors.
    """
    return detection_service.get_visitor_statistics(enterprise_id, date, hour)


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
