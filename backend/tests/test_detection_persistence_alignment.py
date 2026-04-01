import unittest
from unittest.mock import patch

from app.services import detection_service
from app.schemas.detection import (
    DetectionBatchRequest,
    DetectionEventCreate,
    GenderType,
    UnifiedDetectionBatchRequest,
    UnifiedDetectionEvent,
)


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeDetectionTable:
    def __init__(self):
        self.inserted_records = []

    def insert(self, records):
        self.inserted_records = records
        return self

    def execute(self):
        return _FakeResult(self.inserted_records)


class _FakeVisitorStatisticsTable:
    def __init__(self):
        self._operation = ""
        self.inserted_records = []
        self.updated_records = []

    def select(self, *_args, **_kwargs):
        self._operation = "select"
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def insert(self, record):
        self._operation = "insert"
        self.inserted_records.append(record)
        return self

    def update(self, record):
        self._operation = "update"
        self.updated_records.append(record)
        return self

    def execute(self):
        if self._operation == "select":
            return _FakeResult([])
        return _FakeResult([{}])


class _FakeUnifiedMissingTable:
    def select(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def execute(self):
        raise Exception(
            {
                "code": "PGRST205",
                "message": "Could not find the table 'public.unified_detections' in the schema cache",
            }
        )


class _FakeClient:
    def __init__(self):
        self.detection_table = _FakeDetectionTable()
        self.visitor_table = _FakeVisitorStatisticsTable()

    def table(self, name: str):
        if name == "detection_events":
            return self.detection_table
        if name == "visitor_statistics":
            return self.visitor_table
        raise AssertionError(f"Unexpected table requested: {name}")


class _FakeUnifiedClient:
    def table(self, name: str):
        if name == "unified_detections":
            return _FakeUnifiedMissingTable()
        raise AssertionError(f"Unexpected table requested: {name}")


class DetectionPersistenceAlignmentTests(unittest.TestCase):
    def setUp(self) -> None:
        detection_service._UNIFIED_TABLE_AVAILABLE = None

    def test_insert_detection_events_uses_schema_aligned_payload(self) -> None:
        client = _FakeClient()
        event = DetectionEventCreate(
            enterprise_id="ent_archies_001",
            camera_id="cam_live_webcam",
            track_id="track_001",
            timestamp="2026-04-01T00:00:00Z",
            sex=GenderType.MALE,
            confidence_person=0.9,
            confidence_sex=0.8,
            bbox_x=10,
            bbox_y=20,
            bbox_w=30,
            bbox_h=40,
            dwell_seconds=5,
            first_seen="2026-04-01T00:00:00Z",
        )
        batch = DetectionBatchRequest(events=[event])

        with patch("app.services.detection_service.is_supabase_available", return_value=True), patch(
            "app.services.detection_service.get_supabase_client", return_value=client
        ):
            response = detection_service.insert_detection_events(batch)

        self.assertEqual(response.inserted_count, 1)
        self.assertEqual(response.failed_count, 0)
        self.assertEqual(len(client.detection_table.inserted_records), 1)

        record = client.detection_table.inserted_records[0]
        self.assertEqual(
            set(record.keys()),
            {
                "enterprise_id",
                "camera_id",
                "track_id",
                "timestamp",
                "sex",
                "confidence_person",
                "confidence_sex",
                "dwell_seconds",
            },
        )

    def test_aggregate_statistics_batch_uses_count_columns(self) -> None:
        client = _FakeClient()
        event = DetectionEventCreate(
            enterprise_id="ent_archies_001",
            camera_id="cam_live_webcam",
            track_id="track_002",
            timestamp="2026-04-01T01:00:00Z",
            sex=GenderType.MALE,
            confidence_person=0.95,
            confidence_sex=0.82,
            bbox_x=11,
            bbox_y=21,
            bbox_w=31,
            bbox_h=41,
            dwell_seconds=6,
            first_seen="2026-04-01T01:00:00Z",
        )

        with patch("app.services.detection_service.is_supabase_available", return_value=True), patch(
            "app.services.detection_service.get_supabase_client", return_value=client
        ):
            detection_service.aggregate_statistics_batch([event])

        self.assertEqual(len(client.visitor_table.inserted_records), 1)
        inserted = client.visitor_table.inserted_records[0]
        self.assertIn("male_count", inserted)
        self.assertIn("female_count", inserted)
        self.assertIn("unknown_count", inserted)
        self.assertNotIn("male_total", inserted)
        self.assertNotIn("female_total", inserted)
        self.assertNotIn("unknown_total", inserted)

    def test_insert_unified_detection_events_returns_explicit_unavailable(self) -> None:
        client = _FakeUnifiedClient()
        batch = UnifiedDetectionBatchRequest(
            events=[
                UnifiedDetectionEvent(
                    enterprise_id="ent_archies_001",
                    camera_id="cam_live_webcam",
                    person_id="pid_001",
                    track_ids=["track_001"],
                    first_seen="2026-04-01T00:00:00Z",
                    last_seen="2026-04-01T00:00:05Z",
                    total_dwell_seconds=5,
                    gender=GenderType.MALE,
                    gender_confidence=0.9,
                    reid_method="none",
                    reid_confidence=0.0,
                    last_bbox_x=10,
                    last_bbox_y=20,
                    last_bbox_w=30,
                    last_bbox_h=40,
                )
            ]
        )

        with patch("app.services.detection_service.is_supabase_available", return_value=True), patch(
            "app.services.detection_service.get_supabase_client", return_value=client
        ):
            response = detection_service.insert_unified_detection_events(batch)

        self.assertEqual(response.inserted_count, 0)
        self.assertEqual(response.updated_count, 0)
        self.assertEqual(response.failed_count, 1)
        self.assertIn("unavailable", response.message.lower())
        self.assertTrue(response.error_summary)


if __name__ == "__main__":
    unittest.main()
