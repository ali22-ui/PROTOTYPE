import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.state.runtime_store import reset_runtime_state


class CameraStreamTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_runtime_state()
        self.client = TestClient(app)

    def test_camera_stream_progresses_frames(self) -> None:
        first = self.client.get("/api/enterprise/camera/stream", params={"enterprise_id": "ent_archies_001"})
        self.assertEqual(first.status_code, 200)
        first_payload = first.json()

        second = self.client.get("/api/enterprise/camera/stream", params={"enterprise_id": "ent_archies_001"})
        self.assertEqual(second.status_code, 200)
        second_payload = second.json()

        self.assertGreaterEqual(second_payload["frame"], first_payload["frame"])
        self.assertEqual(second_payload["enterprise_id"], "ent_archies_001")

    def test_websocket_subscription_lifecycle(self) -> None:
        with self.client.websocket_connect("/ws/enterprise/camera/ent_archies_001") as ws:
            payload = ws.receive_json()
            self.assertEqual(payload["enterprise_id"], "ent_archies_001")
            self.assertIn("frame", payload)


if __name__ == "__main__":
    unittest.main()
