import asyncio
from datetime import datetime
import random

from fastapi import WebSocket
from fastapi import WebSocketDisconnect

from app.repositories import enterprise_repository
from app.state import runtime_store
from domain_exceptions import DomainNotFoundError


def _build_camera_frame(enterprise_id: str):
    runtime = runtime_store.get_camera_runtime()[enterprise_id]
    runtime["frame"] += 1
    frame = runtime["frame"]
    base = sum(ord(ch) for ch in enterprise_id)
    rng = random.Random(base + frame)

    labels = [
        "Male Tourist",
        "Female Local Resident",
        "Male Non-Local Resident",
        "Female Tourist",
    ]

    boxes = []
    for idx in range(4):
        boxes.append(
            {
                "id": f"trk_{enterprise_id[-3:]}_{idx + 1}",
                "label": labels[idx],
                "x": 8 + ((frame * (idx + 1) * 3) % 70),
                "y": 18 + (idx * 8) + rng.randint(-2, 2),
                "w": 14 + rng.randint(2, 8),
                "h": 32 + rng.randint(4, 10),
            }
        )

    stamp = datetime.now().strftime("%I:%M:%S %p")
    event = f"Frame {frame}: {', '.join(item['label'] for item in boxes)} | {stamp} PST"
    runtime["events"].insert(0, event)
    runtime["events"] = runtime["events"][:300]

    profile = enterprise_repository.get_enterprise_profile(enterprise_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")

    return {
        "enterprise_id": enterprise_id,
        "frame": frame,
        "fps": 6 + (frame % 4),
        "active_tracks": len(boxes),
        "status": "RUNNING",
        "camera_name": profile["cameras"][0]["name"],
        "sample_video_url": "https://samplelib.com/lib/preview/mp4/sample-5s.mp4",
        "boxes": boxes,
        "events": runtime["events"][:100],
    }


async def _camera_broadcast_worker(enterprise_id: str):
    subscribers = runtime_store.get_camera_subscribers()
    tasks = runtime_store.get_camera_broadcast_tasks()
    camera_runtime = runtime_store.get_camera_runtime()
    try:
        while subscribers.get(enterprise_id):
            frame = _build_camera_frame(enterprise_id)
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
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        raise DomainNotFoundError("Enterprise account not found")

    camera_runtime = runtime_store.get_camera_runtime()
    latest = camera_runtime[resolved_id].get("latest_frame")
    if latest:
        return latest

    frame = _build_camera_frame(resolved_id)
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
