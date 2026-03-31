import asyncio
from datetime import datetime
from typing import Generator

from fastapi import WebSocket
from fastapi import WebSocketDisconnect

from app.core.config import CameraSourceMode, get_settings
from app.repositories import enterprise_repository
from app.services.ip_camera_service import (
    get_ip_camera_service,
    IPCameraHealth,
    SourceState,
    SourceStatus,
)
from app.state import runtime_store
from domain_exceptions import DomainNotFoundError, DomainServiceUnavailableError


def _get_camera_frame_response(enterprise_id: str) -> dict:
    """
    Build camera frame response using real source state only.
    No synthetic boxes, events, or sample videos are generated.
    Returns explicit unavailable status when no real camera source is configured.
    """
    profile = enterprise_repository.get_enterprise_profile(enterprise_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")

    ip_service = get_ip_camera_service()
    state = ip_service.get_source_state(enterprise_id)

    camera_name = profile["cameras"][0]["name"] if profile.get("cameras") else "Camera"

    # Build response with real source state only
    response = {
        "enterprise_id": enterprise_id,
        "frame": 0,
        "fps": 0,
        "active_tracks": 0,
        "status": "NO_SOURCE" if state.mode is None else ("RUNNING" if state.health.status == SourceStatus.ONLINE else "OFFLINE"),
        "camera_name": camera_name,
        "source_mode": state.mode,
        "is_live_camera": state.mode in ("live_webcam", "ip_webcam") if state.mode else False,
        "relay_url": state.relay_url,
        "source_status": state.health.status.value if state.health else "unknown",
        "last_frame_at": state.last_frame_at.isoformat() if state.last_frame_at else None,
        "boxes": [],  # No synthetic boxes - only real detections
        "events": [],  # No synthetic events - only real detection events
    }

    # Add diagnostic info when source is unavailable
    if state.mode is None:
        response["diagnostic"] = {
            "message": "No camera source selected. Please configure a camera source.",
            "available_modes": ["live_webcam", "ip_webcam"],
        }
    elif state.health.status != SourceStatus.ONLINE:
        response["diagnostic"] = {
            "message": state.health.last_error or "Camera source is not available",
            "last_ok_at": state.health.last_ok_at.isoformat() if state.health.last_ok_at else None,
        }

    return response


async def _camera_broadcast_worker(enterprise_id: str):
    """
    Broadcast camera state to WebSocket subscribers.
    Only sends real source state, no synthetic frames.
    """
    subscribers = runtime_store.get_camera_subscribers()
    tasks = runtime_store.get_camera_broadcast_tasks()
    camera_runtime = runtime_store.get_camera_runtime()
    try:
        while subscribers.get(enterprise_id):
            frame = _get_camera_frame_response(enterprise_id)
            camera_runtime[enterprise_id]["latest_frame"] = frame

            stale_clients = []
            for subscriber in list(subscribers[enterprise_id]):
                try:
                    await subscriber.send_json(frame)
                except Exception:
                    stale_clients.append(subscriber)

            for subscriber in stale_clients:
                subscribers[enterprise_id].discard(subscriber)

            await asyncio.sleep(1)
    finally:
        tasks.pop(enterprise_id, None)


async def _ensure_camera_broadcast(enterprise_id: str):
    tasks = runtime_store.get_camera_broadcast_tasks()
    task = tasks.get(enterprise_id)
    if not task or task.done():
        tasks[enterprise_id] = asyncio.create_task(_camera_broadcast_worker(enterprise_id))


def get_enterprise_camera_stream(enterprise_id: str):
    """
    Get current camera stream state for an enterprise.
    Returns real source state only - no synthetic frames or fallbacks.
    """
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        raise DomainNotFoundError("Enterprise account not found")

    camera_runtime = runtime_store.get_camera_runtime()
    latest = camera_runtime[resolved_id].get("latest_frame")
    if latest:
        return latest

    frame = _get_camera_frame_response(resolved_id)
    camera_runtime[resolved_id]["latest_frame"] = frame
    return frame


async def ws_enterprise_camera_stream(websocket: WebSocket, enterprise_id: str):
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        await websocket.close(code=1008)
        return

    await websocket.accept()
    subscribers = runtime_store.get_camera_subscribers()
    subscribers.setdefault(resolved_id, set()).add(websocket)

    latest = runtime_store.get_camera_runtime()[resolved_id].get("latest_frame")
    if latest:
        await websocket.send_json(latest)

    await _ensure_camera_broadcast(resolved_id)

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        subscribers.get(resolved_id, set()).discard(websocket)


def get_enterprise_recommendations(enterprise_id: str):
    enterprise = enterprise_repository.get_enterprise_account(enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    return {
        "enterprise_id": enterprise_repository.resolve_enterprise_id(enterprise_id),
        "recommendations": enterprise_repository.list_recommendations(),
    }


def get_camera_source(enterprise_id: str) -> dict:
    """Get current camera source configuration and health."""
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        raise DomainNotFoundError("Enterprise account not found")

    ip_service = get_ip_camera_service()
    state = ip_service.get_source_state(resolved_id)

    # Perform health check if mode is ip_webcam
    if state.mode == "ip_webcam":
        ip_service.check_health(resolved_id)

    settings = get_settings()

    return {
        "enterprise_id": resolved_id,
        "source_mode": state.mode,
        "is_live_camera": state.mode in ("live_webcam", "ip_webcam"),
        "relay_url": state.relay_url,
        "health": {
            "reachable": state.health.reachable,
            "status": state.health.status.value,
            "last_error": state.health.last_error,
            "last_ok_at": state.health.last_ok_at.isoformat() if state.health.last_ok_at else None,
            "latency_ms": state.health.latency_ms,
        },
        "config": {
            "ip_webcam_enabled": settings.ip_webcam_enabled,
            "ip_webcam_base_url": settings.ip_webcam_base_url,
            "ip_webcam_video_path": settings.ip_webcam_video_path,
        },
    }


def set_camera_source(enterprise_id: str, mode: CameraSourceMode) -> dict:
    """Set the camera source mode for an enterprise."""
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        raise DomainNotFoundError("Enterprise account not found")

    ip_service = get_ip_camera_service()
    state = ip_service.set_source_mode(resolved_id, mode)

    # Check health immediately if switching to ip_webcam
    if mode == "ip_webcam":
        ip_service.check_health(resolved_id)

    return {
        "enterprise_id": resolved_id,
        "source_mode": state.mode,
        "is_live_camera": state.mode in ("live_webcam", "ip_webcam"),
        "relay_url": state.relay_url,
        "health": {
            "reachable": state.health.reachable,
            "status": state.health.status.value,
            "last_error": state.health.last_error,
        },
    }


def stream_camera_relay(enterprise_id: str) -> Generator[bytes, None, None]:
    """Stream MJPEG relay for IP webcam."""
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        raise DomainNotFoundError("Enterprise account not found")

    ip_service = get_ip_camera_service()
    yield from ip_service.stream_mjpeg(resolved_id)
