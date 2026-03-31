from typing import Literal

from fastapi import APIRouter, WebSocket
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import CameraSourceMode
from app.services.camera_service import (
    get_enterprise_camera_stream as get_enterprise_camera_stream_service,
    ws_enterprise_camera_stream as ws_enterprise_camera_stream_service,
    get_camera_source as get_camera_source_service,
    set_camera_source as set_camera_source_service,
    stream_camera_relay as stream_camera_relay_service,
)
from app.services.ip_camera_service import get_ip_camera_service

router = APIRouter(tags=["Camera"])
ws_router = APIRouter(tags=["Camera WebSocket"])


class SetSourceRequest(BaseModel):
    mode: CameraSourceMode


@router.get("/enterprise/camera/stream")
def get_enterprise_camera_stream(
    enterprise_id: str = "ent_archies_001",
):
    return get_enterprise_camera_stream_service(enterprise_id)


@router.get("/enterprise/camera/source")
def get_camera_source(
    enterprise_id: str = "ent_archies_001",
):
    """Get current camera source configuration and health status."""
    return get_camera_source_service(enterprise_id)


@router.post("/enterprise/camera/source")
def set_camera_source(
    request: SetSourceRequest,
    enterprise_id: str = "ent_archies_001",
):
    """Set camera source mode (mock, live_webcam, or ip_webcam)."""
    return set_camera_source_service(enterprise_id, request.mode)


@router.get("/enterprise/camera/relay.mjpeg")
def get_camera_relay(
    enterprise_id: str = "ent_archies_001",
):
    """
    Relay MJPEG stream from IP webcam.
    Returns a multipart/x-mixed-replace stream suitable for <img> tags.
    """
    return StreamingResponse(
        stream_camera_relay_service(enterprise_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "keep-alive",
        },
    )


@ws_router.websocket("/ws/enterprise/camera/{enterprise_id}")
async def ws_enterprise_camera_stream(
    websocket: WebSocket,
    enterprise_id: str,
):
    await ws_enterprise_camera_stream_service(websocket, enterprise_id)


@router.get("/enterprise/camera/metrics")
def get_camera_pipeline_metrics(
    enterprise_id: str = "ent_archies_001",
):
    """
    Get real-time camera pipeline performance metrics.
    
    Returns FPS, latency, frame drop rate, and other performance indicators
    for the optimized real-time pipeline (PRD_016).
    """
    ip_service = get_ip_camera_service()
    metrics = ip_service.get_pipeline_metrics(enterprise_id)
    
    if metrics is None:
        return {
            "enterprise_id": enterprise_id,
            "status": "no_active_stream",
            "message": "No active real-time stream for this enterprise",
            "metrics": None,
        }
    
    return {
        "enterprise_id": enterprise_id,
        "status": "active",
        "metrics": metrics,
    }


@router.post("/enterprise/camera/stream/stop")
def stop_camera_stream(
    enterprise_id: str = "ent_archies_001",
):
    """
    Stop the real-time camera stream for an enterprise.
    
    This releases resources and stops the background capture thread.
    """
    ip_service = get_ip_camera_service()
    ip_service.stop_realtime_streamer(enterprise_id)
    
    return {
        "enterprise_id": enterprise_id,
        "status": "stopped",
        "message": "Real-time stream stopped successfully",
    }
