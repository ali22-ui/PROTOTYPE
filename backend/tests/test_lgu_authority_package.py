import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.state.runtime_store import reset_runtime_state


class LGUAuthorityPackageTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_runtime_state()
        self.client = TestClient(app)

    def test_report_detail_and_authority_package_generation(self) -> None:
        reports_response = self.client.get("/api/lgu/reports")
        self.assertEqual(reports_response.status_code, 200)
        reports = reports_response.json()["reports"]
        self.assertGreaterEqual(len(reports), 1)
        report_id = reports[0]["report_id"]

        detail_response = self.client.get(f"/api/lgu/reports/{report_id}")
        self.assertEqual(detail_response.status_code, 200)
        detail_payload = detail_response.json()
        self.assertEqual(detail_payload["report_id"], report_id)

        generate_response = self.client.post(f"/api/lgu/reports/{report_id}/generate-authority-package")
        self.assertEqual(generate_response.status_code, 200)
        package_payload = generate_response.json()
        self.assertIn("authority_package_id", package_payload)

        pdf_response = self.client.post(f"/api/lgu/reports/{report_id}/authority-package/pdf")
        self.assertEqual(pdf_response.status_code, 200)
        self.assertEqual(pdf_response.headers["content-type"], "application/pdf")

        docx_response = self.client.post(f"/api/lgu/reports/{report_id}/authority-package/docx")
        self.assertEqual(docx_response.status_code, 200)
        self.assertEqual(
            docx_response.headers["content-type"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )


if __name__ == "__main__":
    unittest.main()
