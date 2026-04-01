"""
Detection event schemas for camera ML processing.
Defines data structures for person detection and gender classification.
"""
from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class GenderType(str, Enum):
    MALE = "male"
    FEMALE = "female"
    UNKNOWN = "unknown"


class ReIdentificationMethod(str, Enum):
    """Method used for re-identifying a person."""
    NONE = "none"
    GEOMETRIC = "geometric"
    APPEARANCE = "appearance"
    FACE = "face"


class BoundingBox(BaseModel):
    """Bounding box coordinates (percentage-based for responsive display)."""
    x: float = Field(..., ge=0, le=100, description="X position (0-100%)")
    y: float = Field(..., ge=0, le=100, description="Y position (0-100%)")
    w: float = Field(..., ge=0, le=100, description="Width (0-100%)")
    h: float = Field(..., ge=0, le=100, description="Height (0-100%)")


class DetectionConfidence(BaseModel):
    """Confidence scores for detection and classification."""
    person: float = Field(..., ge=0, le=1, description="Person detection confidence")
    sex: Optional[float] = Field(None, ge=0, le=1, description="Gender classification confidence")


class DetectionEvent(BaseModel):
    """Single person detection event from camera ML processing."""
    enterprise_id: str
    camera_id: str
    track_id: str = Field(..., description="Unique tracking ID for the person")
    timestamp: datetime
    sex: GenderType = GenderType.UNKNOWN
    confidence: DetectionConfidence
    bbox: BoundingBox
    dwell_seconds: int = Field(0, ge=0, description="Time since first detection")
    first_seen: datetime


class DetectionEventCreate(BaseModel):
    """Schema for creating detection events (from frontend)."""
    enterprise_id: str
    camera_id: str
    track_id: str
    timestamp: datetime
    sex: GenderType = GenderType.UNKNOWN
    confidence_person: float = Field(..., ge=0, le=1)
    confidence_sex: Optional[float] = Field(None, ge=0, le=1)
    bbox_x: float = Field(..., ge=0, le=100)
    bbox_y: float = Field(..., ge=0, le=100)
    bbox_w: float = Field(..., ge=0, le=100)
    bbox_h: float = Field(..., ge=0, le=100)
    dwell_seconds: int = Field(0, ge=0)
    first_seen: datetime


class DetectionBatchRequest(BaseModel):
    """Batch request for multiple detection events."""
    events: list[DetectionEventCreate] = Field(..., min_length=1, max_length=100)


class DetectionBatchResponse(BaseModel):
    """Response for batch detection insert."""
    inserted_count: int
    failed_count: int = 0
    message: str = "Success"
    error_summary: Optional[str] = None


# === Unified Deduplication Schemas (PRD-006) ===


class PersonIdentityCreate(BaseModel):
    """Schema for creating/updating a unique person identity."""
    person_id: str = Field(..., description="Unique person identifier (persistent across tracks)")
    track_ids: list[str] = Field(..., min_length=1, description="Associated track IDs")
    first_seen: datetime
    last_seen: datetime
    total_dwell_seconds: int = Field(0, ge=0)
    gender: GenderType = GenderType.UNKNOWN
    gender_confidence: float = Field(0, ge=0, le=1)
    reid_method: ReIdentificationMethod = ReIdentificationMethod.NONE
    reid_confidence: float = Field(0, ge=0, le=1)
    reid_count: int = Field(0, ge=0, description="Number of times re-identified")


class UnifiedDetectionEvent(BaseModel):
    """Deduplicated person event for unified submission."""
    enterprise_id: str
    camera_id: str
    person_id: str = Field(..., description="Unique person identifier")
    track_ids: list[str] = Field(..., min_length=1, description="All associated track IDs")
    first_seen: datetime
    last_seen: datetime
    total_dwell_seconds: int = Field(0, ge=0)
    gender: GenderType = GenderType.UNKNOWN
    gender_confidence: float = Field(0, ge=0, le=1)
    reid_method: ReIdentificationMethod = ReIdentificationMethod.NONE
    reid_confidence: float = Field(0, ge=0, le=1)
    last_bbox_x: float = Field(..., ge=0, le=100)
    last_bbox_y: float = Field(..., ge=0, le=100)
    last_bbox_w: float = Field(..., ge=0, le=100)
    last_bbox_h: float = Field(..., ge=0, le=100)


class UnifiedDetectionBatchRequest(BaseModel):
    """Batch request for unified deduplicated person events."""
    events: list[UnifiedDetectionEvent] = Field(..., min_length=1, max_length=100)


class UnifiedDetectionBatchResponse(BaseModel):
    """Response for unified detection batch insert."""
    inserted_count: int
    updated_count: int = 0
    failed_count: int = 0
    message: str = "Success"
    error_summary: Optional[str] = None


class DeduplicationStats(BaseModel):
    """Statistics about deduplication effectiveness."""
    total_tracks: int = Field(0, description="Total raw tracks detected")
    unique_persons: int = Field(0, description="Unique persons after deduplication")
    reid_success_count: int = Field(0, description="Successful re-identifications")
    reid_by_geometric: int = Field(0, description="Re-IDs via geometric matching")
    reid_by_appearance: int = Field(0, description="Re-IDs via appearance matching")
    reid_by_face: int = Field(0, description="Re-IDs via face embedding")
    dedup_ratio: float = Field(0, ge=0, description="Deduplication ratio (1 - unique/total)")
    warning: Optional[str] = None


class VisitorStatistics(BaseModel):
    """Aggregated visitor statistics for a time period."""
    enterprise_id: str
    date: str
    hour: Optional[int] = Field(None, ge=0, le=23)
    male_total: int = 0
    female_total: int = 0
    unknown_total: int = 0
    unique_visitors: int = 0
    avg_dwell_seconds: Optional[int] = None
    dedup_stats: Optional[DeduplicationStats] = None


class CameraLogRecord(BaseModel):
    """Normalized camera log session row sourced from database detections."""
    id: str
    unique_id: str
    time_in_iso: str
    time_out_iso: str
    duration_hours: float
    classification: str
    male_count: int
    female_count: int
    total_count: int


class RecentDetectionFeedEvent(BaseModel):
    """Recent detection event row for monitoring feed surfaces."""
    id: str
    time_iso: str
    frame: int
    details: str


class CameraFrame(BaseModel):
    """Live camera frame data for frontend display."""
    enterprise_id: str
    frame: int
    fps: int
    active_tracks: int
    status: str
    camera_name: str
    boxes: list[dict]
    events: list[str]
    is_live_camera: bool = False


class CameraStatus(BaseModel):
    """Camera device status and configuration."""
    camera_id: str
    enterprise_id: str
    name: str
    status: str = "INACTIVE"
    device_id: Optional[str] = None
    last_active: Optional[datetime] = None
