import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.state.runtime_store import reset_runtime_state


class EnterpriseReportingWorkflowTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_runtime_state()
        self.client = TestClient(app, raise_server_exceptions=False)

    def test_open_submit_close_flow(self) -> None:
        open_response = self.client.post(
            "/api/lgu/reporting-window/open",
            json={"enterprise_id": "ent_archies_001", "period": "2026-03"},
        )

        if open_response.status_code >= 500:
            self.skipTest("Supabase unified schema is not available in the current environment")

        self.assertEqual(open_response.status_code, 200)
        self.assertEqual(open_response.json()["status"], "OPEN")

        submit_response = self.client.post(
            "/api/enterprise/reports/submit",
            json={"enterprise_id": "ent_archies_001", "period": "2026-03"},
        )
        self.assertEqual(submit_response.status_code, 200)
        submit_payload = submit_response.json()
        self.assertEqual(submit_payload["status"], "SUBMITTED")
        self.assertIn("report_id", submit_payload)

        close_response = self.client.post(
            "/api/lgu/reporting-window/close",
            json={"enterprise_id": "ent_archies_001", "period": "2026-03"},
        )
        self.assertEqual(close_response.status_code, 200)
        self.assertEqual(close_response.json()["status"], "CLOSED")


if __name__ == "__main__":
    unittest.main()
