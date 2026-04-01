import asyncio
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.requests import Request

from app.main import app
from app.state.runtime_store import reset_runtime_state
from domain_exceptions import DomainConflictError, DomainForbiddenError, DomainNotFoundError, DomainServiceUnavailableError


class ErrorMappingTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_runtime_state()
        self.client = TestClient(app)

    def test_api_not_found_and_conflict_mappings(self) -> None:
        not_found = self.client.get("/api/enterprise/profile", params={"enterprise_id": "ent_missing_999"})
        self.assertEqual(not_found.status_code, 404)

        conflict = self.client.post(
            "/api/enterprise/reports/submit",
            json={"enterprise_id": "ent_archies_001", "period": "2026-03"},
        )
        self.assertEqual(conflict.status_code, 409)

    def test_registered_exception_handlers(self) -> None:
        async def run_check() -> tuple[int, int, int]:
            request = Request({"type": "http", "method": "GET", "path": "/"})
            not_found_handler = app.exception_handlers[DomainNotFoundError]
            forbidden_handler = app.exception_handlers[DomainForbiddenError]
            conflict_handler = app.exception_handlers[DomainConflictError]
            nf = await not_found_handler(request, DomainNotFoundError("x"))
            fb = await forbidden_handler(request, DomainForbiddenError("x"))
            cf = await conflict_handler(request, DomainConflictError("x"))
            return nf.status_code, fb.status_code, cf.status_code

        nf_code, fb_code, cf_code = asyncio.run(run_check())
        self.assertEqual(nf_code, 404)
        self.assertEqual(fb_code, 403)
        self.assertEqual(cf_code, 409)

    def test_enterprise_profile_falls_back_when_reporting_window_is_denied(self) -> None:
        with patch(
            "app.services.enterprise_service.reporting_window_repo.get_by_enterprise_current",
            side_effect=DomainServiceUnavailableError("db unavailable"),
        ), patch(
            "app.services.enterprise_service.system_settings_repo.get_reporting_window_state",
            return_value={"is_reporting_window_open": True, "updated_at": None, "updated_by": "system"},
        ):
            response = self.client.get("/api/enterprise/profile", params={"enterprise_id": "ent_archies_001"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["reporting_window_status"], "OPEN")


if __name__ == "__main__":
    unittest.main()
