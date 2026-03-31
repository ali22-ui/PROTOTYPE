import unittest
from unittest.mock import patch


class _DummySettings:
    camera_source_mode = None
    ip_webcam_base_url = "http://192.168.1.10:8080"
    ip_webcam_video_path = "/video"
    ip_webcam_snapshot_path = "/shot.jpg"
    ip_webcam_connect_timeout_seconds = 1.0
    ip_webcam_read_timeout_seconds = 1.0

    @staticmethod
    def is_ip_webcam_url_safe(url: str) -> bool:
        _ = url
        return True


class _DummyStreamer:
    instances: list["_DummyStreamer"] = []

    def __init__(self, source: str, inference_callback=None, jpeg_quality: int = 80):
        _ = source
        _ = inference_callback
        _ = jpeg_quality
        self._running = False
        self.stopped = False
        _DummyStreamer.instances.append(self)

    def start(self):
        self._running = True

    def stop(self):
        self.stopped = True
        self._running = False

    def stream_frames(self):
        while self._running:
            yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\nabc\r\n"

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def metrics(self):
        return None


class IPCameraRealtimeLifecycleTests(unittest.TestCase):
    def test_stream_cleanup_happens_after_last_consumer_disconnects(self) -> None:
        from app.services.ip_camera_service import IPCameraService

        _DummyStreamer.instances.clear()

        with patch("app.services.ip_camera_service.get_settings", return_value=_DummySettings()), patch.object(
            IPCameraService, "_check_opencv", return_value=True
        ), patch("app.services.realtime_camera_pipeline.RealtimeMJPEGStreamer", _DummyStreamer):
            service = IPCameraService()

            gen_a = service.stream_mjpeg_realtime("ent_archies_001")
            next(gen_a)
            self.assertEqual(service._stream_consumers.get("ent_archies_001"), 1)

            gen_b = service.stream_mjpeg_realtime("ent_archies_001")
            next(gen_b)
            self.assertEqual(service._stream_consumers.get("ent_archies_001"), 2)

            gen_a.close()
            self.assertEqual(service._stream_consumers.get("ent_archies_001"), 1)
            self.assertIn("ent_archies_001", service._realtime_streamers)

            gen_b.close()
            self.assertNotIn("ent_archies_001", service._stream_consumers)
            self.assertNotIn("ent_archies_001", service._realtime_streamers)
            self.assertTrue(_DummyStreamer.instances[0].stopped)


if __name__ == "__main__":
    unittest.main()
