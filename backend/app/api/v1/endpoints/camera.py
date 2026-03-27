from fastapi import APIRouter, WebSocket

from app.services.camera_service import get_enterprise_camera_stream as get_enterprise_camera_stream_service
from app.services.camera_service import ws_enterprise_camera_stream as ws_enterprise_camera_stream_service

router = APIRouter(tags=["Camera"])
ws_router = APIRouter(tags=["Camera WebSocket"])


@router.get("/enterprise/camera/stream")
def get_enterprise_camera_stream(
    enterprise_id: str = "ent_archies_001",
):
    return get_enterprise_camera_stream_service(enterprise_id)


@ws_router.websocket("/ws/enterprise/camera/{enterprise_id}")
async def ws_enterprise_camera_stream(
    websocket: WebSocket,
    enterprise_id: str,
):
    await ws_enterprise_camera_stream_service(websocket, enterprise_id)
