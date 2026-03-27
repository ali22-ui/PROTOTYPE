from fastapi import WebSocket

from app.repositories.mock_repository import get_core_module


core = get_core_module()


def get_enterprise_camera_stream(enterprise_id: str):
    return core.get_enterprise_camera_stream(enterprise_id)


async def ws_enterprise_camera_stream(websocket: WebSocket, enterprise_id: str):
    await core.ws_enterprise_camera_stream(websocket, enterprise_id)


def get_enterprise_recommendations(enterprise_id: str):
    return core.get_enterprise_recommendations(enterprise_id)
