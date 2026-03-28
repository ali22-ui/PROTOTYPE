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
