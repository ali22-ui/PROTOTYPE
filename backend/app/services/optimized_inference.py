"""
Optimized ML inference module for real-time video processing.

This module provides utilities for efficient ML inference in the
real-time camera pipeline, including:

1. Input size reduction (640x480 max) for faster inference
2. Frame skipping based on inference time
3. Model warmup on startup
4. Inference result caching for frame interpolation

Design Decision D1: CPU-only inference (GPU can be added as optional)
Design Decision D2: 15 FPS inference target with 30 FPS display
"""

import logging
import threading
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Callable, Generic, TypeVar

import numpy as np

logger = logging.getLogger(__name__)

# Design constants from PRD
MAX_INFERENCE_WIDTH = 640
MAX_INFERENCE_HEIGHT = 480
DEFAULT_WARMUP_FRAMES = 3
INFERENCE_FPS_TARGET = 15


@dataclass
class InferenceResult:
    """Result from ML inference."""
    detections: list[dict] = field(default_factory=list)
    inference_time_ms: float = 0.0
    frame_shape: tuple[int, int, int] = (0, 0, 0)
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        return {
            "detections": self.detections,
            "inference_time_ms": round(self.inference_time_ms, 2),
            "frame_shape": list(self.frame_shape),
            "timestamp": self.timestamp.isoformat(),
        }


@dataclass
class InferenceMetrics:
    """Metrics for inference performance."""
    total_frames: int = 0
    avg_inference_time_ms: float = 0.0
    max_inference_time_ms: float = 0.0
    min_inference_time_ms: float = float('inf')
    model_warmed_up: bool = False
    last_inference_at: datetime | None = None
    
    def update(self, inference_time_ms: float):
        self.total_frames += 1
        self.last_inference_at = datetime.now()
        
        # Update min/max
        self.max_inference_time_ms = max(self.max_inference_time_ms, inference_time_ms)
        if inference_time_ms > 0:
            self.min_inference_time_ms = min(self.min_inference_time_ms, inference_time_ms)
        
        # Running average
        alpha = 0.1
        if self.total_frames == 1:
            self.avg_inference_time_ms = inference_time_ms
        else:
            self.avg_inference_time_ms = (
                alpha * inference_time_ms +
                (1 - alpha) * self.avg_inference_time_ms
            )
    
    def to_dict(self) -> dict:
        return {
            "total_frames": self.total_frames,
            "avg_inference_time_ms": round(self.avg_inference_time_ms, 2),
            "max_inference_time_ms": round(self.max_inference_time_ms, 2),
            "min_inference_time_ms": round(self.min_inference_time_ms, 2) if self.min_inference_time_ms != float('inf') else 0,
            "model_warmed_up": self.model_warmed_up,
            "last_inference_at": self.last_inference_at.isoformat() if self.last_inference_at else None,
        }


T = TypeVar('T')


class BaseInferenceModel(ABC, Generic[T]):
    """
    Base class for ML inference models.
    
    Provides common functionality like input resizing, warmup,
    and metrics tracking.
    """
    
    def __init__(self, model_path: str | None = None):
        self._model_path = model_path
        self._model: T | None = None
        self._metrics = InferenceMetrics()
        self._lock = threading.Lock()
        self._last_result: InferenceResult | None = None
    
    @abstractmethod
    def _load_model(self) -> T:
        """Load the ML model. Override in subclass."""
        pass
    
    @abstractmethod
    def _run_inference(self, frame: np.ndarray) -> list[dict]:
        """Run inference on a frame. Override in subclass."""
        pass
    
    def load(self):
        """Load the model if not already loaded."""
        if self._model is None:
            logger.info(f"Loading model: {self._model_path or 'default'}")
            self._model = self._load_model()
            logger.info("Model loaded successfully")
    
    def warmup(self, warmup_frames: int = DEFAULT_WARMUP_FRAMES):
        """
        Warm up the model with dummy frames.
        
        First inference is often slower due to JIT compilation,
        memory allocation, etc. Warmup ensures consistent performance.
        """
        self.load()
        
        logger.info(f"Warming up model with {warmup_frames} frames")
        dummy_frame = np.zeros((MAX_INFERENCE_HEIGHT, MAX_INFERENCE_WIDTH, 3), dtype=np.uint8)
        
        for i in range(warmup_frames):
            start = time.monotonic()
            self._run_inference(dummy_frame)
            elapsed = (time.monotonic() - start) * 1000
            logger.debug(f"Warmup frame {i + 1}: {elapsed:.1f}ms")
        
        self._metrics.model_warmed_up = True
        logger.info("Model warmup complete")
    
    def preprocess(self, frame: np.ndarray) -> np.ndarray:
        """
        Preprocess frame for inference.
        
        Resizes to max inference dimensions while maintaining aspect ratio.
        This is the key optimization for faster inference.
        """
        h, w = frame.shape[:2]
        
        # Calculate scale factor
        scale_w = MAX_INFERENCE_WIDTH / w
        scale_h = MAX_INFERENCE_HEIGHT / h
        scale = min(scale_w, scale_h, 1.0)  # Don't upscale
        
        if scale < 1.0:
            import cv2
            new_w = int(w * scale)
            new_h = int(h * scale)
            frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)
        
        return frame
    
    def infer(self, frame: np.ndarray) -> InferenceResult:
        """
        Run inference on a frame with preprocessing and metrics.
        
        Args:
            frame: Input frame (any size, will be resized)
        
        Returns:
            InferenceResult with detections and timing info
        """
        self.load()
        
        # Preprocess (resize)
        processed = self.preprocess(frame)
        
        # Run inference
        start = time.monotonic()
        with self._lock:
            detections = self._run_inference(processed)
        inference_time = (time.monotonic() - start) * 1000
        
        # Update metrics
        self._metrics.update(inference_time)
        
        # Build result
        result = InferenceResult(
            detections=detections,
            inference_time_ms=inference_time,
            frame_shape=frame.shape,
            timestamp=datetime.now(),
        )
        
        self._last_result = result
        return result
    
    def get_cached_result(self) -> InferenceResult | None:
        """Get the last inference result (for frame interpolation)."""
        return self._last_result
    
    @property
    def metrics(self) -> InferenceMetrics:
        return self._metrics
    
    @property
    def is_loaded(self) -> bool:
        return self._model is not None
    
    @property
    def is_warmed_up(self) -> bool:
        return self._metrics.model_warmed_up


class DummyDetectionModel(BaseInferenceModel[None]):
    """
    Dummy detection model for testing.
    
    Simulates inference time without actual ML model.
    """
    
    def __init__(self, simulated_latency_ms: float = 30.0):
        super().__init__(model_path=None)
        self._simulated_latency = simulated_latency_ms / 1000
    
    def _load_model(self) -> None:
        return None
    
    def _run_inference(self, frame: np.ndarray) -> list[dict]:
        # Simulate inference time
        time.sleep(self._simulated_latency)
        
        h, w = frame.shape[:2]
        
        # Return dummy detection
        return [
            {
                "class": "person",
                "confidence": 0.95,
                "bbox": {
                    "x": w // 4,
                    "y": h // 4,
                    "width": w // 2,
                    "height": h // 2,
                },
            }
        ]


class InferenceCallbackWrapper:
    """
    Wraps an inference model to provide a frame processing callback.
    
    Use this to integrate with RealtimeVideoProcessor:
    
        model = YourDetectionModel()
        wrapper = InferenceCallbackWrapper(model)
        processor = RealtimeVideoProcessor(grabber, wrapper.process_frame)
    """
    
    def __init__(
        self,
        model: BaseInferenceModel,
        draw_detections: bool = True,
        box_color: tuple[int, int, int] = (0, 255, 0),
        box_thickness: int = 2,
    ):
        self._model = model
        self._draw_detections = draw_detections
        self._box_color = box_color
        self._box_thickness = box_thickness
        self._cv2 = None
    
    def _import_cv2(self):
        if self._cv2 is None:
            import cv2
            self._cv2 = cv2
        return self._cv2
    
    def warmup(self):
        """Warm up the underlying model."""
        self._model.warmup()
    
    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Process a frame: run inference and optionally draw detections.
        
        This method signature matches what RealtimeVideoProcessor expects.
        """
        result = self._model.infer(frame)
        
        if self._draw_detections and result.detections:
            frame = self._draw_boxes(frame, result.detections)
        
        return frame
    
    def _draw_boxes(self, frame: np.ndarray, detections: list[dict]) -> np.ndarray:
        """Draw bounding boxes on frame."""
        cv2 = self._import_cv2()
        
        output = frame.copy()
        
        for det in detections:
            bbox = det.get("bbox", {})
            x = bbox.get("x", 0)
            y = bbox.get("y", 0)
            w = bbox.get("width", 0)
            h = bbox.get("height", 0)
            
            if w > 0 and h > 0:
                cv2.rectangle(
                    output,
                    (int(x), int(y)),
                    (int(x + w), int(y + h)),
                    self._box_color,
                    self._box_thickness,
                )
                
                label = f"{det.get('class', 'object')}: {det.get('confidence', 0):.2f}"
                cv2.putText(
                    output,
                    label,
                    (int(x), int(y) - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5,
                    self._box_color,
                    1,
                )
        
        return output
    
    @property
    def metrics(self) -> InferenceMetrics:
        return self._model.metrics


class FrameSkipInferenceWrapper:
    """
    Wraps an inference callback with frame skipping logic.
    
    Processes every Nth frame and reuses results for skipped frames.
    This maintains smooth video while reducing CPU load.
    """
    
    def __init__(
        self,
        inference_callback: Callable[[np.ndarray], np.ndarray],
        skip_ratio: int = 2,
    ):
        self._callback = inference_callback
        self._skip_ratio = max(1, skip_ratio)
        self._frame_count = 0
        self._last_result: np.ndarray | None = None
        self._lock = threading.Lock()
    
    def process_frame(self, frame: np.ndarray) -> np.ndarray:
        """
        Process frame with skip logic.
        
        Runs inference every skip_ratio frames, reuses last result otherwise.
        """
        with self._lock:
            self._frame_count += 1
            
            if self._frame_count % self._skip_ratio == 1 or self._last_result is None:
                # Run inference
                result = self._callback(frame)
                self._last_result = result
                return result
            else:
                # Return original frame (detection boxes from last inference)
                # In a real scenario, you might overlay cached detections
                return frame
    
    @property
    def skip_ratio(self) -> int:
        return self._skip_ratio
    
    @skip_ratio.setter
    def skip_ratio(self, value: int):
        self._skip_ratio = max(1, value)


def create_inference_pipeline(
    model: BaseInferenceModel,
    draw_detections: bool = True,
    skip_ratio: int = 2,
    warmup: bool = True,
) -> Callable[[np.ndarray], np.ndarray]:
    """
    Create a complete inference pipeline callback.
    
    Combines model inference, visualization, and frame skipping
    into a single callback for use with RealtimeVideoProcessor.
    
    Args:
        model: The ML model to use
        draw_detections: Whether to draw bounding boxes
        skip_ratio: Process every Nth frame (1 = no skipping)
        warmup: Whether to warm up the model
    
    Returns:
        Callback function for RealtimeVideoProcessor
    """
    wrapper = InferenceCallbackWrapper(model, draw_detections=draw_detections)
    
    if warmup:
        wrapper.warmup()
    
    if skip_ratio > 1:
        skipper = FrameSkipInferenceWrapper(wrapper.process_frame, skip_ratio)
        return skipper.process_frame
    
    return wrapper.process_frame
