"""
IP Camera Service for ingesting video from Android IP Webcam.
Supports OpenCV VideoCapture as primary and requests-based MJPEG fallback.

Now includes optimized real-time pipeline (PRD_016) with:
- Threaded frame capture
- Minimal buffering (CAP_PROP_BUFFERSIZE = 1)
- Adaptive frame skipping
- FPS monitoring
"""
import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import AsyncGenerator, Callable, Generator

import numpy as np
import requests

from app.core.config import CameraSourceMode, get_settings

logger = logging.getLogger(__name__)

# Feature flag for real-time pipeline (PRD_016)
USE_REALTIME_PIPELINE = True


class SourceStatus(str, Enum):
    ONLINE = "online"
    DEGRADED = "degraded"
    OFFLINE = "offline"
    UNKNOWN = "unknown"


@dataclass
class IPCameraHealth:
    """Health status for an IP camera source."""
    reachable: bool = False
    last_error: str | None = None
    last_ok_at: datetime | None = None
    last_check_at: datetime | None = None
    status: SourceStatus = SourceStatus.UNKNOWN
    latency_ms: float | None = None


@dataclass
class SourceState:
    """Runtime state for a camera source."""
    mode: CameraSourceMode | None = None  # None = no source selected, requires explicit user selection
    health: IPCameraHealth = field(default_factory=IPCameraHealth)
    relay_url: str | None = None
    last_frame_at: datetime | None = None
    pipeline_metrics: dict | None = None  # Real-time pipeline metrics


class IPCameraService:
    """Service for managing IP webcam stream ingestion."""

    def __init__(self):
        self._settings = get_settings()
        self._opencv_available = self._check_opencv()
        self._source_states: dict[str, SourceState] = {}
        self._realtime_streamers: dict[str, "RealtimeMJPEGStreamer"] = {}
        self._inference_callback: Callable[[np.ndarray], np.ndarray] | None = None

    def _check_opencv(self) -> bool:
        """Check if OpenCV is available."""
        try:
            import cv2  # noqa: F401
            return True
        except ImportError:
            logger.warning("OpenCV not available, using fallback HTTP streaming")
            return False

    def get_source_state(self, enterprise_id: str) -> SourceState:
        """Get or create source state for enterprise."""
        if enterprise_id not in self._source_states:
            self._source_states[enterprise_id] = SourceState(
                mode=self._settings.camera_source_mode
            )
        return self._source_states[enterprise_id]

    def set_source_mode(self, enterprise_id: str, mode: CameraSourceMode) -> SourceState:
        """Set the camera source mode for an enterprise."""
        state = self.get_source_state(enterprise_id)
        state.mode = mode
        if mode == "ip_webcam":
            state.relay_url = f"/api/enterprise/camera/relay.mjpeg?enterprise_id={enterprise_id}"
        else:
            state.relay_url = None
        return state

    def build_video_url(self, base_url: str | None = None) -> str:
        """Build the full video stream URL."""
        base = base_url or self._settings.ip_webcam_base_url
        base = base.rstrip("/")
        path = self._settings.ip_webcam_video_path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{base}{path}"

    def build_snapshot_url(self, base_url: str | None = None) -> str:
        """Build the full snapshot URL."""
        base = base_url or self._settings.ip_webcam_base_url
        base = base.rstrip("/")
        path = self._settings.ip_webcam_snapshot_path
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{base}{path}"

    def check_health(self, enterprise_id: str, url: str | None = None) -> IPCameraHealth:
        """Check if the IP camera is reachable."""
        state = self.get_source_state(enterprise_id)
        health = state.health
        health.last_check_at = datetime.now()

        target_url = url or self.build_snapshot_url()

        # SSRF prevention
        if not self._settings.is_ip_webcam_url_safe(target_url):
            health.reachable = False
            health.last_error = "URL not in allowed private network range"
            health.status = SourceStatus.OFFLINE
            return health

        try:
            start = time.monotonic()
            response = requests.head(
                target_url,
                timeout=(
                    self._settings.ip_webcam_connect_timeout_seconds,
                    self._settings.ip_webcam_read_timeout_seconds
                ),
                allow_redirects=True
            )
            elapsed = (time.monotonic() - start) * 1000

            if response.status_code == 200:
                health.reachable = True
                health.last_ok_at = datetime.now()
                health.last_error = None
                health.status = SourceStatus.ONLINE
                health.latency_ms = elapsed
            else:
                health.reachable = False
                health.last_error = f"HTTP {response.status_code}"
                health.status = SourceStatus.DEGRADED

        except requests.exceptions.Timeout:
            health.reachable = False
            health.last_error = "Connection timeout"
            health.status = SourceStatus.OFFLINE
        except requests.exceptions.ConnectionError as e:
            health.reachable = False
            health.last_error = f"Connection error: {str(e)[:100]}"
            health.status = SourceStatus.OFFLINE
        except Exception as e:
            health.reachable = False
            health.last_error = f"Unknown error: {str(e)[:100]}"
            health.status = SourceStatus.OFFLINE

        return health

    def read_snapshot(self) -> bytes | None:
        """Read a single snapshot frame from the IP camera."""
        url = self.build_snapshot_url()

        if not self._settings.is_ip_webcam_url_safe(url):
            logger.error("Snapshot URL not in allowed range")
            return None

        try:
            response = requests.get(
                url,
                timeout=(
                    self._settings.ip_webcam_connect_timeout_seconds,
                    self._settings.ip_webcam_read_timeout_seconds
                ),
                stream=False
            )
            if response.status_code == 200:
                return response.content
            logger.warning(f"Snapshot returned status {response.status_code}")
            return None
        except Exception as e:
            logger.error(f"Failed to read snapshot: {e}")
            return None

    def stream_mjpeg_opencv(self, enterprise_id: str) -> Generator[bytes, None, None]:
        """Stream MJPEG frames using OpenCV VideoCapture (legacy method)."""
        if not self._opencv_available:
            logger.error("OpenCV not available for streaming")
            return

        import cv2

        url = self.build_video_url()
        if not self._settings.is_ip_webcam_url_safe(url):
            logger.error("Video URL not in allowed range")
            return

        state = self.get_source_state(enterprise_id)
        cap = cv2.VideoCapture(url)
        
        # PRD_016: Set minimal buffer size
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not cap.isOpened():
            logger.error(f"Failed to open video stream: {url}")
            state.health.status = SourceStatus.OFFLINE
            state.health.last_error = "Failed to open stream"
            return

        state.health.status = SourceStatus.ONLINE
        state.health.reachable = True

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Failed to read frame, stream may have ended")
                    break

                state.last_frame_at = datetime.now()

                # Encode frame as JPEG
                success, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
                if not success:
                    continue

                # Yield MJPEG boundary format
                yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n'

        except Exception as e:
            logger.error(f"Stream error: {e}")
            state.health.status = SourceStatus.DEGRADED
            state.health.last_error = str(e)
        finally:
            cap.release()

    def stream_mjpeg_requests(self, enterprise_id: str) -> Generator[bytes, None, None]:
        """Stream MJPEG frames using requests (fallback method)."""
        url = self.build_video_url()

        if not self._settings.is_ip_webcam_url_safe(url):
            logger.error("Video URL not in allowed range")
            return

        state = self.get_source_state(enterprise_id)

        try:
            response = requests.get(
                url,
                timeout=(
                    self._settings.ip_webcam_connect_timeout_seconds,
                    self._settings.ip_webcam_read_timeout_seconds
                ),
                stream=True
            )

            if response.status_code != 200:
                logger.error(f"Stream returned status {response.status_code}")
                state.health.status = SourceStatus.OFFLINE
                return

            state.health.status = SourceStatus.ONLINE
            state.health.reachable = True

            # Parse MJPEG stream
            boundary = None
            content_type = response.headers.get('Content-Type', '')
            if 'boundary=' in content_type:
                boundary = content_type.split('boundary=')[1].strip()

            buffer = b''
            for chunk in response.iter_content(chunk_size=8192):
                if not chunk:
                    continue

                buffer += chunk

                # Look for JPEG markers
                while True:
                    start = buffer.find(b'\xff\xd8')
                    end = buffer.find(b'\xff\xd9')

                    if start != -1 and end != -1 and end > start:
                        jpeg_data = buffer[start:end + 2]
                        buffer = buffer[end + 2:]

                        state.last_frame_at = datetime.now()
                        yield b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + jpeg_data + b'\r\n'
                    else:
                        break

        except requests.exceptions.Timeout:
            logger.error("Stream connection timeout")
            state.health.status = SourceStatus.OFFLINE
            state.health.last_error = "Connection timeout"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            state.health.status = SourceStatus.DEGRADED
            state.health.last_error = str(e)

    def stream_mjpeg_realtime(self, enterprise_id: str) -> Generator[bytes, None, None]:
        """
        Stream MJPEG using the optimized real-time pipeline (PRD_016).
        
        This method uses threaded capture with minimal buffering to eliminate
        the lag accumulation problem in traditional OpenCV pipelines.
        """
        if not self._opencv_available:
            logger.error("OpenCV not available for streaming")
            return

        from app.services.realtime_camera_pipeline import RealtimeMJPEGStreamer

        url = self.build_video_url()
        if not self._settings.is_ip_webcam_url_safe(url):
            logger.error("Video URL not in allowed range")
            return

        state = self.get_source_state(enterprise_id)
        
        # Create or reuse streamer for this enterprise
        if enterprise_id in self._realtime_streamers:
            streamer = self._realtime_streamers[enterprise_id]
            if not streamer.is_running:
                streamer.stop()
                del self._realtime_streamers[enterprise_id]
                streamer = None
        else:
            streamer = None

        if streamer is None:
            streamer = RealtimeMJPEGStreamer(
                source=url,
                inference_callback=self._inference_callback,
                jpeg_quality=80,
            )
            try:
                streamer.start()
                self._realtime_streamers[enterprise_id] = streamer
                state.health.status = SourceStatus.ONLINE
                state.health.reachable = True
                logger.info(f"Started real-time streamer for enterprise {enterprise_id}")
            except Exception as e:
                logger.error(f"Failed to start real-time streamer: {e}")
                state.health.status = SourceStatus.OFFLINE
                state.health.last_error = str(e)
                return

        try:
            for frame_bytes in streamer.stream_frames():
                state.last_frame_at = datetime.now()
                
                # Update metrics
                if streamer.metrics:
                    state.pipeline_metrics = streamer.metrics.to_dict()
                
                yield frame_bytes
        except Exception as e:
            logger.error(f"Real-time stream error: {e}")
            state.health.status = SourceStatus.DEGRADED
            state.health.last_error = str(e)
        finally:
            # Don't stop streamer here - let it run for reconnection
            pass

    def stop_realtime_streamer(self, enterprise_id: str):
        """Stop the real-time streamer for an enterprise."""
        if enterprise_id in self._realtime_streamers:
            self._realtime_streamers[enterprise_id].stop()
            del self._realtime_streamers[enterprise_id]
            logger.info(f"Stopped real-time streamer for enterprise {enterprise_id}")

    def set_inference_callback(self, callback: Callable[[np.ndarray], np.ndarray] | None):
        """
        Set the ML inference callback for real-time processing.
        
        The callback should accept a frame (numpy array) and return
        a processed frame (numpy array).
        """
        self._inference_callback = callback
        logger.info(f"Inference callback {'set' if callback else 'cleared'}")

    def get_pipeline_metrics(self, enterprise_id: str) -> dict | None:
        """Get real-time pipeline metrics for an enterprise."""
        if enterprise_id in self._realtime_streamers:
            streamer = self._realtime_streamers[enterprise_id]
            if streamer.metrics:
                return streamer.metrics.to_dict()
        
        state = self.get_source_state(enterprise_id)
        return state.pipeline_metrics

    def stream_mjpeg(self, enterprise_id: str) -> Generator[bytes, None, None]:
        """Stream MJPEG using best available method."""
        # PRD_016: Use real-time pipeline when enabled and OpenCV available
        if USE_REALTIME_PIPELINE and self._opencv_available:
            yield from self.stream_mjpeg_realtime(enterprise_id)
        elif self._opencv_available:
            yield from self.stream_mjpeg_opencv(enterprise_id)
        else:
            yield from self.stream_mjpeg_requests(enterprise_id)

    async def stream_mjpeg_async(self, enterprise_id: str) -> AsyncGenerator[bytes, None]:
        """Async wrapper for MJPEG streaming."""
        loop = asyncio.get_event_loop()

        # Run sync generator in thread pool
        def sync_gen():
            return list(self.stream_mjpeg(enterprise_id))

        # For now, yield frames from sync generator
        # In production, consider using aiohttp for true async streaming
        for frame in self.stream_mjpeg(enterprise_id):
            yield frame
            await asyncio.sleep(0.01)  # Yield control


# Singleton instance
_ip_camera_service: IPCameraService | None = None


def get_ip_camera_service() -> IPCameraService:
    """Get or create the IP camera service singleton."""
    global _ip_camera_service
    if _ip_camera_service is None:
        _ip_camera_service = IPCameraService()
    return _ip_camera_service
