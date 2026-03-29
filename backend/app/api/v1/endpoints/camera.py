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
