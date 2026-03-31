import unittest
from unittest.mock import patch

from domain_exceptions import DomainNotFoundError, DomainServiceUnavailableError


class EnterpriseReportingContractTests(unittest.TestCase):
    def test_reporting_window_status_raises_not_found_when_window_missing(self) -> None:
        from app.services.enterprise_service import get_reporting_window_status

        with patch("app.services.enterprise_service._require_supabase", return_value=None), patch(
            "app.services.enterprise_service._get_reporting_window_safe", return_value=None
        ):
            with self.assertRaises(DomainNotFoundError):
                get_reporting_window_status("ent_archies_001")

    def test_reporting_window_status_propagates_service_unavailable(self) -> None:
        from app.services.enterprise_service import get_reporting_window_status

        with patch("app.services.enterprise_service._require_supabase", return_value=None), patch(
            "app.services.enterprise_service._get_reporting_window_safe",
            side_effect=DomainServiceUnavailableError("db unavailable"),
        ):
            with self.assertRaises(DomainServiceUnavailableError):
                get_reporting_window_status("ent_archies_001")


if __name__ == "__main__":
    unittest.main()
