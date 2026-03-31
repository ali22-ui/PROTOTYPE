"""
Tests for the real-time camera pipeline (PRD_016).

Tests cover:
1. ThreadedFrameGrabber - capture thread and atomic frame access
2. BufferlessVideoCapture - buffer control and reconnection
3. AdaptiveFrameSkipper - frame skipping logic
4. RealtimeVideoProcessor - processing with inference callback
5. PipelineMetrics - metrics tracking
"""

import threading
import time
from unittest.mock import MagicMock, patch

import numpy as np
import pytest


class TestFPSCounter:
    """Tests for FPSCounter class."""
    
    def test_fps_calculation(self):
        """FPS should be calculated correctly from frame timestamps."""
        from app.services.realtime_camera_pipeline import FPSCounter
        
        counter = FPSCounter()
        
        # Simulate 30 FPS (33ms between frames)
        for _ in range(30):
            counter.tick()
            time.sleep(0.033)
        
        # Should be close to 30 FPS
        assert 25 <= counter.fps <= 35

    def test_empty_counter(self):
        """Empty counter should return 0 FPS."""
        from app.services.realtime_camera_pipeline import FPSCounter
        
        counter = FPSCounter()
        assert counter.fps == 0.0


class TestAdaptiveFrameSkipper:
    """Tests for AdaptiveFrameSkipper class."""
    
    def test_initial_should_process(self):
        """First call should always allow processing."""
        from app.services.realtime_camera_pipeline import AdaptiveFrameSkipper
        
        skipper = AdaptiveFrameSkipper(target_fps=15)
        assert skipper.should_process() is True

    def test_skip_when_too_fast(self):
        """Should skip processing when called faster than target FPS."""
        from app.services.realtime_camera_pipeline import AdaptiveFrameSkipper
        
        skipper = AdaptiveFrameSkipper(target_fps=10)  # 100ms interval
        
        # First call should pass
        assert skipper.should_process() is True
        
        # Immediate second call should fail
        assert skipper.should_process() is False
        
        # After waiting 100ms, should pass again
        time.sleep(0.11)
        assert skipper.should_process() is True

    def test_inference_time_update(self):
        """Inference time should be tracked with running average."""
        from app.services.realtime_camera_pipeline import AdaptiveFrameSkipper
        
        skipper = AdaptiveFrameSkipper(target_fps=15)
        
        # Update with 50ms inference time
        skipper.update_inference_time(0.050)
        
        # Should have updated the average
        assert skipper.avg_inference_time_ms > 0

    def test_adaptive_slowdown(self):
        """Should slow down when inference is slower than target."""
        from app.services.realtime_camera_pipeline import AdaptiveFrameSkipper
        
        skipper = AdaptiveFrameSkipper(target_fps=30)  # ~33ms target
        
        # Simulate slow inference (100ms)
        for _ in range(10):
            skipper.should_process()
            skipper.update_inference_time(0.100)
        
        # Effective FPS should be lower than target
        assert skipper.effective_fps < 30


class TestPipelineMetrics:
    """Tests for PipelineMetrics class."""
    
    def test_metrics_initialization(self):
        """Metrics should initialize with default values."""
        from app.services.realtime_camera_pipeline import PipelineMetrics
        
        metrics = PipelineMetrics()
        
        assert metrics.capture_fps == 0.0
        assert metrics.process_fps == 0.0
        assert metrics.frames_captured == 0
        assert metrics.frames_processed == 0

    def test_metrics_to_dict(self):
        """Metrics should serialize to dictionary."""
        from app.services.realtime_camera_pipeline import PipelineMetrics
        
        metrics = PipelineMetrics(
            capture_fps=30.0,
            process_fps=15.0,
            inference_time_ms=50.0,
            latency_ms=100.0,
        )
        
        data = metrics.to_dict()
        
        assert data["capture_fps"] == 30.0
        assert data["process_fps"] == 15.0
        assert data["inference_time_ms"] == 50.0
        assert data["latency_ms"] == 100.0


class TestBufferlessVideoCapture:
    """Tests for BufferlessVideoCapture class."""
    
    @patch('cv2.VideoCapture')
    def test_open_sets_buffer_size(self, mock_cv2_capture):
        """Opening should set CAP_PROP_BUFFERSIZE to 1."""
        from app.services.realtime_camera_pipeline import BufferlessVideoCapture
        
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = True
        mock_cv2_capture.return_value = mock_cap
        
        capture = BufferlessVideoCapture("http://test:8080/video")
        result = capture.open()
        
        assert result is True
        # Verify buffer size was set to 1
        mock_cap.set.assert_any_call(1, 1)  # CAP_PROP_BUFFERSIZE = 1

    @patch('cv2.VideoCapture')
    def test_open_failure(self, mock_cv2_capture):
        """Should return False when capture fails to open."""
        from app.services.realtime_camera_pipeline import BufferlessVideoCapture
        
        mock_cap = MagicMock()
        mock_cap.isOpened.return_value = False
        mock_cv2_capture.return_value = mock_cap
        
        capture = BufferlessVideoCapture("http://test:8080/video")
        result = capture.open()
        
        assert result is False

    def test_reconnect_backoff(self):
        """Reconnection should use exponential backoff."""
        from app.services.realtime_camera_pipeline import BufferlessVideoCapture
        
        capture = BufferlessVideoCapture("http://test:8080/video")
        
        # Simulate first reconnect attempt
        capture._last_reconnect_time = 0
        
        # Should not reconnect immediately after first attempt
        with patch.object(capture, 'open', return_value=False):
            capture.try_reconnect()
            
        assert capture.reconnect_attempts == 1


class TestThreadedFrameGrabber:
    """Tests for ThreadedFrameGrabber class."""
    
    def test_read_returns_none_when_not_started(self):
        """Read should return (False, None, 0) when not started."""
        from app.services.realtime_camera_pipeline import ThreadedFrameGrabber
        
        grabber = ThreadedFrameGrabber("http://test:8080/video")
        ret, frame, timestamp = grabber.read()
        
        assert ret is False
        assert frame is None
        assert timestamp == 0.0

    def test_is_running_when_not_started(self):
        """is_running should be False when not started."""
        from app.services.realtime_camera_pipeline import ThreadedFrameGrabber
        
        grabber = ThreadedFrameGrabber("http://test:8080/video")
        assert grabber.is_running is False

    @patch('app.services.realtime_camera_pipeline.BufferlessVideoCapture')
    def test_start_creates_thread(self, mock_capture_class):
        """Start should create and run capture thread."""
        from app.services.realtime_camera_pipeline import ThreadedFrameGrabber
        
        mock_capture = MagicMock()
        mock_capture.open.return_value = True
        mock_capture.is_opened.return_value = True
        mock_capture.read.return_value = (True, np.zeros((480, 640, 3), dtype=np.uint8))
        mock_capture_class.return_value = mock_capture
        
        grabber = ThreadedFrameGrabber("http://test:8080/video")
        grabber.start()
        
        # Give thread time to start
        time.sleep(0.1)
        
        assert grabber.is_running is True
        
        grabber.stop()

    @patch('app.services.realtime_camera_pipeline.BufferlessVideoCapture')
    def test_read_returns_latest_frame(self, mock_capture_class):
        """Read should return the most recent frame."""
        from app.services.realtime_camera_pipeline import ThreadedFrameGrabber
        
        test_frame = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
        
        mock_capture = MagicMock()
        mock_capture.open.return_value = True
        mock_capture.is_opened.return_value = True
        mock_capture.read.return_value = (True, test_frame)
        mock_capture_class.return_value = mock_capture
        
        grabber = ThreadedFrameGrabber("http://test:8080/video")
        grabber.start()
        
        # Wait for frame capture
        time.sleep(0.2)
        
        ret, frame, timestamp = grabber.read()
        
        assert ret is True
        assert frame is not None
        assert frame.shape == (480, 640, 3)
        assert timestamp > 0
        
        grabber.stop()


class TestRealtimeVideoProcessor:
    """Tests for RealtimeVideoProcessor class."""
    
    def test_processor_with_no_callback(self):
        """Processor should work without inference callback."""
        from app.services.realtime_camera_pipeline import (
            ThreadedFrameGrabber,
            RealtimeVideoProcessor,
        )
        
        # Create mock grabber
        mock_grabber = MagicMock()
        mock_grabber.is_running = True
        mock_grabber.read.return_value = (
            True, 
            np.zeros((480, 640, 3), dtype=np.uint8),
            time.monotonic()
        )
        mock_grabber.metrics = MagicMock()
        mock_grabber.metrics.capture_fps = 30.0
        mock_grabber.metrics.frames_captured = 100
        mock_grabber.metrics.frames_dropped = 5
        
        processor = RealtimeVideoProcessor(mock_grabber, inference_callback=None)
        processor.start()
        
        time.sleep(0.2)
        
        assert processor.is_running is True
        
        processor.stop()

    def test_processor_calls_inference_callback(self):
        """Processor should call inference callback on frames."""
        from app.services.realtime_camera_pipeline import (
            RealtimeVideoProcessor,
        )
        
        callback_called = threading.Event()
        
        def mock_callback(frame: np.ndarray) -> np.ndarray:
            callback_called.set()
            return frame
        
        # Create mock grabber
        mock_grabber = MagicMock()
        mock_grabber.is_running = True
        mock_grabber.read.return_value = (
            True,
            np.zeros((480, 640, 3), dtype=np.uint8),
            time.monotonic()
        )
        mock_grabber.metrics = MagicMock()
        mock_grabber.metrics.capture_fps = 30.0
        mock_grabber.metrics.frames_captured = 100
        mock_grabber.metrics.frames_dropped = 5
        
        processor = RealtimeVideoProcessor(mock_grabber, inference_callback=mock_callback)
        processor.start()
        
        # Wait for callback to be called
        callback_called.wait(timeout=1.0)
        
        assert callback_called.is_set()
        
        processor.stop()


class TestResizeForInference:
    """Tests for resize_for_inference function."""
    
    def test_resize_large_frame(self):
        """Large frames should be resized to max dimensions."""
        from app.services.realtime_camera_pipeline import resize_for_inference
        
        # 1920x1080 frame
        large_frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        
        resized = resize_for_inference(large_frame, max_width=640, max_height=480)
        
        # Should be smaller
        assert resized.shape[0] <= 480
        assert resized.shape[1] <= 640

    def test_no_resize_small_frame(self):
        """Small frames should not be resized."""
        from app.services.realtime_camera_pipeline import resize_for_inference
        
        # 320x240 frame (smaller than max)
        small_frame = np.zeros((240, 320, 3), dtype=np.uint8)
        
        resized = resize_for_inference(small_frame, max_width=640, max_height=480)
        
        # Should be unchanged
        assert resized.shape == (240, 320, 3)

    def test_aspect_ratio_preserved(self):
        """Resize should preserve aspect ratio."""
        from app.services.realtime_camera_pipeline import resize_for_inference
        
        # 16:9 frame
        frame = np.zeros((1080, 1920, 3), dtype=np.uint8)
        original_ratio = 1920 / 1080
        
        resized = resize_for_inference(frame, max_width=640, max_height=480)
        
        resized_ratio = resized.shape[1] / resized.shape[0]
        
        # Aspect ratio should be approximately preserved
        assert abs(original_ratio - resized_ratio) < 0.1


class TestInferenceMetrics:
    """Tests for InferenceMetrics class."""
    
    def test_metrics_update(self):
        """Metrics should track inference times correctly."""
        from app.services.optimized_inference import InferenceMetrics
        
        metrics = InferenceMetrics()
        
        metrics.update(50.0)
        metrics.update(60.0)
        metrics.update(40.0)
        
        assert metrics.total_frames == 3
        assert metrics.max_inference_time_ms == 60.0
        assert metrics.min_inference_time_ms == 40.0
        assert metrics.avg_inference_time_ms > 0

    def test_metrics_to_dict(self):
        """Metrics should serialize to dictionary."""
        from app.services.optimized_inference import InferenceMetrics
        
        metrics = InferenceMetrics()
        metrics.update(50.0)
        
        data = metrics.to_dict()
        
        assert "total_frames" in data
        assert "avg_inference_time_ms" in data
        assert "model_warmed_up" in data


class TestDummyDetectionModel:
    """Tests for DummyDetectionModel class."""
    
    def test_inference_returns_detection(self):
        """Inference should return dummy detection."""
        from app.services.optimized_inference import DummyDetectionModel
        
        model = DummyDetectionModel(simulated_latency_ms=1.0)
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        result = model.infer(frame)
        
        assert len(result.detections) == 1
        assert result.detections[0]["class"] == "person"
        assert result.inference_time_ms > 0

    def test_model_warmup(self):
        """Warmup should mark model as warmed up."""
        from app.services.optimized_inference import DummyDetectionModel
        
        model = DummyDetectionModel(simulated_latency_ms=1.0)
        
        assert model.is_warmed_up is False
        
        model.warmup(warmup_frames=2)
        
        assert model.is_warmed_up is True


class TestFrameSkipInferenceWrapper:
    """Tests for FrameSkipInferenceWrapper class."""
    
    def test_processes_first_frame(self):
        """Should always process the first frame."""
        from app.services.optimized_inference import FrameSkipInferenceWrapper
        
        callback = MagicMock(return_value=np.zeros((480, 640, 3), dtype=np.uint8))
        wrapper = FrameSkipInferenceWrapper(callback, skip_ratio=2)
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        wrapper.process_frame(frame)
        
        callback.assert_called_once()

    def test_skips_frames(self):
        """Should skip frames according to skip ratio."""
        from app.services.optimized_inference import FrameSkipInferenceWrapper
        
        callback = MagicMock(return_value=np.zeros((480, 640, 3), dtype=np.uint8))
        wrapper = FrameSkipInferenceWrapper(callback, skip_ratio=2)
        
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        
        # Process 4 frames with skip_ratio=2
        # Should process frames 1, 3 (every other starting from 1)
        for _ in range(4):
            wrapper.process_frame(frame)
        
        # Should have been called twice (frames 1 and 3)
        assert callback.call_count == 2
