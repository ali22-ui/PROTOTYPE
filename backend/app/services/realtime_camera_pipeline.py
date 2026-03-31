"""
Real-Time Camera Pipeline for low-latency video processing.

This module implements a threaded architecture that prioritizes fresh frames
over processing every frame, eliminating the lag accumulation problem in
traditional OpenCV-based pipelines.

Architecture:
    [Capture Thread] -> [Atomic Frame Buffer] -> [Processing Thread]
         (fast)            (always latest)          (ML inference)

Key optimizations:
1. Thread separation: Capture and processing on separate threads
2. Atomic latest frame: Only store/read the most recent frame
3. Buffer size control: CAP_PROP_BUFFERSIZE = 1
4. Adaptive frame skipping: Process every Nth frame based on load
5. FPS monitoring: Real-time performance metrics
"""

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Generator

import numpy as np

logger = logging.getLogger(__name__)

# Design Decision D2: 15 FPS for inference, 30 FPS for display
INFERENCE_FPS = 15
DISPLAY_FPS = 30
FRAME_SKIP_RATIO = 2

# Design Decision D4: Exponential backoff reconnection
RECONNECT_DELAYS = [1, 2, 4, 8, 16, 30, 30, 30, 30, 30]  # seconds
MAX_RECONNECT_ATTEMPTS = 10


@dataclass
class PipelineMetrics:
    """Real-time performance metrics for the pipeline."""
    capture_fps: float = 0.0
    process_fps: float = 0.0
    inference_time_ms: float = 0.0
    frame_drop_rate: float = 0.0
    latency_ms: float = 0.0
    buffer_size: int = 0
    frames_captured: int = 0
    frames_processed: int = 0
    frames_dropped: int = 0
    last_update: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> dict:
        """Convert metrics to dictionary for API response."""
        return {
            "capture_fps": round(self.capture_fps, 1),
            "process_fps": round(self.process_fps, 1),
            "inference_time_ms": round(self.inference_time_ms, 1),
            "frame_drop_rate": round(self.frame_drop_rate * 100, 1),
            "latency_ms": round(self.latency_ms, 1),
            "buffer_size": self.buffer_size,
            "frames_captured": self.frames_captured,
            "frames_processed": self.frames_processed,
            "frames_dropped": self.frames_dropped,
            "last_update": self.last_update.isoformat(),
        }


class BufferlessVideoCapture:
    """
    Wrapper around cv2.VideoCapture with minimal buffering.
    
    Sets CAP_PROP_BUFFERSIZE = 1 and handles reconnection with
    exponential backoff on stream failure.
    """

    def __init__(self, source: str):
        self._source = source
        self._cap = None
        self._reconnect_attempts = 0
        self._last_reconnect_time = 0.0
        self._cv2 = None

    def _import_cv2(self):
        """Lazy import OpenCV."""
        if self._cv2 is None:
            import cv2
            self._cv2 = cv2
        return self._cv2

    def open(self) -> bool:
        """Open the video capture with minimal buffering."""
        cv2 = self._import_cv2()
        
        self._cap = cv2.VideoCapture(self._source)
        
        if not self._cap.isOpened():
            logger.error(f"Failed to open video stream: {self._source}")
            return False
        
        # Minimize internal buffer (key optimization)
        self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        # Force MJPEG codec for IP cameras
        self._cap.set(cv2.CAP_PROP_FOURCC, cv2.VideoWriter_fourcc(*'MJPG'))
        
        self._reconnect_attempts = 0
        logger.info(f"Opened video stream: {self._source}")
        return True

    def read(self) -> tuple[bool, np.ndarray | None]:
        """Read a frame from the capture."""
        if self._cap is None:
            return False, None
        return self._cap.read()

    def is_opened(self) -> bool:
        """Check if capture is open."""
        return self._cap is not None and self._cap.isOpened()

    def release(self):
        """Release the capture."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    def try_reconnect(self) -> bool:
        """
        Attempt reconnection with exponential backoff.
        Returns True if reconnection was attempted (regardless of success).
        """
        if self._reconnect_attempts >= MAX_RECONNECT_ATTEMPTS:
            logger.error(f"Max reconnection attempts ({MAX_RECONNECT_ATTEMPTS}) reached")
            return False

        delay = RECONNECT_DELAYS[min(self._reconnect_attempts, len(RECONNECT_DELAYS) - 1)]
        now = time.monotonic()
        
        if now - self._last_reconnect_time < delay:
            return False  # Not time to reconnect yet

        self._last_reconnect_time = now
        self._reconnect_attempts += 1
        
        logger.info(f"Reconnection attempt {self._reconnect_attempts}/{MAX_RECONNECT_ATTEMPTS}")
        
        self.release()
        return self.open()

    @property
    def reconnect_attempts(self) -> int:
        return self._reconnect_attempts


class ThreadedFrameGrabber:
    """
    Continuously captures frames in a background thread.
    Always provides the LATEST frame, dropping old ones.
    
    This eliminates the OpenCV buffer lag problem by ensuring
    the processing thread always gets the most recent frame.
    """

    def __init__(self, source: str, target_fps: int = DISPLAY_FPS):
        self._source = source
        self._target_fps = target_fps
        self._frame_interval = 1.0 / target_fps
        
        self._capture = BufferlessVideoCapture(source)
        self._frame: np.ndarray | None = None
        self._frame_timestamp: float = 0.0
        self._lock = threading.Lock()
        self._stopped = threading.Event()
        self._thread: threading.Thread | None = None
        
        # Metrics
        self._metrics = PipelineMetrics()
        self._fps_counter = FPSCounter()
        self._frames_captured = 0

    def start(self) -> "ThreadedFrameGrabber":
        """Start the capture thread."""
        if not self._capture.open():
            raise RuntimeError(f"Failed to open video source: {self._source}")
        
        self._stopped.clear()
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info("ThreadedFrameGrabber started")
        return self

    def _capture_loop(self):
        """Background thread that continuously captures frames."""
        while not self._stopped.is_set():
            loop_start = time.monotonic()
            ret, frame = self._capture.read()
            
            if not ret or frame is None:
                if not self._stopped.is_set():
                    logger.warning("Failed to read frame, attempting reconnection")
                    if not self._capture.try_reconnect():
                        time.sleep(0.1)
                continue
            
            # Store the latest frame (atomic swap)
            timestamp = time.monotonic()
            with self._lock:
                self._frame = frame
                self._frame_timestamp = timestamp
                self._frames_captured += 1
            
            self._fps_counter.tick()
            self._metrics.capture_fps = self._fps_counter.fps
            self._metrics.frames_captured = self._frames_captured

            elapsed = time.monotonic() - loop_start
            sleep_for = self._frame_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)

    def read(self) -> tuple[bool, np.ndarray | None, float]:
        """
        Read the latest frame (non-blocking).
        
        Returns:
            Tuple of (success, frame, timestamp)
            - success: True if a frame is available
            - frame: The latest frame (may be None)
            - timestamp: Monotonic timestamp when frame was captured
        """
        with self._lock:
            if self._frame is None:
                return False, None, 0.0
            # Return a copy to prevent race conditions
            return True, self._frame.copy(), self._frame_timestamp

    def read_if_fresh(self, max_age_ms: float = 100.0) -> tuple[bool, np.ndarray | None]:
        """
        Read frame only if it's fresh (captured within max_age_ms).
        
        This is useful when you want to skip processing if the frame
        is too old (e.g., during slow inference).
        """
        with self._lock:
            if self._frame is None:
                return False, None
            
            age_ms = (time.monotonic() - self._frame_timestamp) * 1000
            if age_ms > max_age_ms:
                self._metrics.frames_dropped += 1
                return False, None
            
            return True, self._frame.copy()

    def stop(self):
        """Stop the capture thread."""
        self._stopped.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        self._capture.release()
        logger.info("ThreadedFrameGrabber stopped")

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def metrics(self) -> PipelineMetrics:
        return self._metrics

    @property
    def capture_fps(self) -> float:
        return self._fps_counter.fps


class AdaptiveFrameSkipper:
    """
    Skip frames to maintain real-time performance.
    
    Dynamically adjusts skip ratio based on actual inference time
    to ensure the pipeline doesn't fall behind.
    """

    def __init__(self, target_fps: int = INFERENCE_FPS):
        self._target_interval = 1.0 / target_fps
        self._last_process_time = 0.0
        self._avg_inference_time = 0.033  # 33ms initial estimate
        self._alpha = 0.1  # Smoothing factor for running average

    def should_process(self) -> bool:
        """Returns True if enough time has passed to process next frame."""
        now = time.monotonic()
        elapsed = now - self._last_process_time
        
        # Process if we've waited at least target_interval
        if elapsed >= self._target_interval:
            self._last_process_time = now
            return True
        return False

    def update_inference_time(self, elapsed: float):
        """Update running average of inference time."""
        self._avg_inference_time = (
            self._alpha * elapsed +
            (1 - self._alpha) * self._avg_inference_time
        )
        
        # Dynamically adjust target interval if inference is slow
        if self._avg_inference_time > self._target_interval:
            # We can't keep up, slow down gracefully
            self._target_interval = self._avg_inference_time * 1.1

    @property
    def avg_inference_time_ms(self) -> float:
        return self._avg_inference_time * 1000

    @property
    def effective_fps(self) -> float:
        return 1.0 / self._target_interval if self._target_interval > 0 else 0


class FPSCounter:
    """Lightweight FPS counter using exponential moving average."""

    def __init__(self, window_size: int = 30):
        self._window_size = window_size
        self._timestamps: list[float] = []
        self._fps = 0.0

    def tick(self):
        """Record a frame timestamp."""
        now = time.monotonic()
        self._timestamps.append(now)
        
        # Keep only recent timestamps
        cutoff = now - 1.0  # 1 second window
        self._timestamps = [t for t in self._timestamps if t > cutoff]
        
        # Calculate FPS
        if len(self._timestamps) >= 2:
            elapsed = self._timestamps[-1] - self._timestamps[0]
            if elapsed > 0:
                self._fps = (len(self._timestamps) - 1) / elapsed

    @property
    def fps(self) -> float:
        return self._fps


class RealtimeVideoProcessor:
    """
    Processes video frames in real-time with adaptive frame skipping.
    
    Consumes frames from ThreadedFrameGrabber and applies optional
    ML inference, always prioritizing fresh frames over completeness.
    """

    def __init__(
        self,
        frame_grabber: ThreadedFrameGrabber,
        inference_callback: Callable[[np.ndarray], np.ndarray] | None = None,
        target_fps: int = INFERENCE_FPS,
    ):
        self._grabber = frame_grabber
        self._inference_callback = inference_callback
        self._skipper = AdaptiveFrameSkipper(target_fps)
        self._fps_counter = FPSCounter()
        self._stopped = threading.Event()
        self._thread: threading.Thread | None = None
        self._latest_result: np.ndarray | None = None
        self._result_lock = threading.Lock()
        self._metrics = PipelineMetrics()

    def start(self) -> "RealtimeVideoProcessor":
        """Start the processing thread."""
        self._stopped.clear()
        self._thread = threading.Thread(target=self._process_loop, daemon=True)
        self._thread.start()
        logger.info("RealtimeVideoProcessor started")
        return self

    def _process_loop(self):
        """Background thread that processes frames."""
        while not self._stopped.is_set():
            if not self._skipper.should_process():
                time.sleep(0.001)  # Small sleep to prevent CPU spin
                continue
            
            ret, frame, timestamp = self._grabber.read()
            if not ret or frame is None:
                time.sleep(0.01)
                continue
            
            # Calculate frame age (latency)
            frame_age_ms = (time.monotonic() - timestamp) * 1000
            self._metrics.latency_ms = frame_age_ms
            
            # Run inference if callback provided
            start_time = time.monotonic()
            if self._inference_callback is not None:
                try:
                    result = self._inference_callback(frame)
                except Exception:
                    logger.exception("Inference callback failed")
                    result = frame
            else:
                result = frame
            
            inference_time = time.monotonic() - start_time
            self._skipper.update_inference_time(inference_time)
            self._metrics.inference_time_ms = inference_time * 1000
            
            # Store result
            with self._result_lock:
                self._latest_result = result
            
            self._fps_counter.tick()
            self._metrics.process_fps = self._fps_counter.fps
            self._metrics.frames_processed += 1

    def get_latest_frame(self) -> np.ndarray | None:
        """Get the latest processed frame."""
        with self._result_lock:
            return self._latest_result.copy() if self._latest_result is not None else None

    def stop(self):
        """Stop the processing thread."""
        self._stopped.set()
        if self._thread is not None:
            self._thread.join(timeout=2.0)
            self._thread = None
        logger.info("RealtimeVideoProcessor stopped")

    @property
    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def metrics(self) -> PipelineMetrics:
        # Combine grabber and processor metrics
        grabber_metrics = self._grabber.metrics
        self._metrics.capture_fps = grabber_metrics.capture_fps
        self._metrics.frames_captured = grabber_metrics.frames_captured
        self._metrics.frames_dropped = grabber_metrics.frames_dropped
        
        if grabber_metrics.frames_captured > 0:
            self._metrics.frame_drop_rate = (
                grabber_metrics.frames_dropped / grabber_metrics.frames_captured
            )
        
        self._metrics.last_update = datetime.now()
        return self._metrics


class RealtimeMJPEGStreamer:
    """
    Streams MJPEG frames from a real-time pipeline.
    
    Combines ThreadedFrameGrabber and RealtimeVideoProcessor
    to provide a low-latency MJPEG stream.
    """

    def __init__(
        self,
        source: str,
        inference_callback: Callable[[np.ndarray], np.ndarray] | None = None,
        jpeg_quality: int = 80,
    ):
        self._source = source
        self._inference_callback = inference_callback
        self._jpeg_quality = jpeg_quality
        self._grabber: ThreadedFrameGrabber | None = None
        self._processor: RealtimeVideoProcessor | None = None
        self._cv2 = None

    def _import_cv2(self):
        if self._cv2 is None:
            import cv2
            self._cv2 = cv2
        return self._cv2

    def start(self):
        """Start the streaming pipeline."""
        self._grabber = ThreadedFrameGrabber(self._source).start()
        self._processor = RealtimeVideoProcessor(
            self._grabber,
            self._inference_callback,
        ).start()
        logger.info("RealtimeMJPEGStreamer started")

    def stop(self):
        """Stop the streaming pipeline."""
        if self._processor:
            self._processor.stop()
        if self._grabber:
            self._grabber.stop()
        logger.info("RealtimeMJPEGStreamer stopped")

    def stream_frames(self) -> Generator[bytes, None, None]:
        """Generate MJPEG frames for HTTP streaming."""
        cv2 = self._import_cv2()
        fps_counter = FPSCounter()
        frame_interval = 1.0 / DISPLAY_FPS
        
        while self._grabber and self._grabber.is_running:
            loop_start = time.monotonic()
            # Get latest processed frame
            frame = self._processor.get_latest_frame() if self._processor else None
            
            if frame is None:
                # Fall back to raw capture if processor not ready
                ret, frame, _ = self._grabber.read()
                if not ret or frame is None:
                    time.sleep(0.01)
                    continue
            
            # Encode as JPEG
            encode_params = [cv2.IMWRITE_JPEG_QUALITY, self._jpeg_quality]
            success, buffer = cv2.imencode('.jpg', frame, encode_params)
            
            if not success:
                continue
            
            fps_counter.tick()
            
            # Yield MJPEG boundary format
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n' +
                buffer.tobytes() +
                b'\r\n'
            )

            elapsed = time.monotonic() - loop_start
            sleep_for = frame_interval - elapsed
            if sleep_for > 0:
                time.sleep(sleep_for)

    @property
    def metrics(self) -> PipelineMetrics | None:
        return self._processor.metrics if self._processor else None

    @property
    def is_running(self) -> bool:
        return (
            self._grabber is not None and self._grabber.is_running and
            self._processor is not None and self._processor.is_running
        )


def resize_for_inference(
    frame: np.ndarray,
    max_width: int = 640,
    max_height: int = 480,
) -> np.ndarray:
    """
    Resize frame for ML inference while maintaining aspect ratio.
    
    This is a key optimization: processing at 640x480 is ~4x faster
    than 1280x720 for most ML models.
    """
    import cv2
    
    h, w = frame.shape[:2]
    
    # Calculate scale factor
    scale_w = max_width / w
    scale_h = max_height / h
    scale = min(scale_w, scale_h)
    
    if scale >= 1.0:
        return frame  # Already small enough
    
    new_w = int(w * scale)
    new_h = int(h * scale)
    
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
