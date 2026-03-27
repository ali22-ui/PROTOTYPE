from app.repositories.mock_repository import get_core_module
from app.schemas.enterprise import EnterpriseActionRequest, EnterpriseReportSubmission
from app.schemas.lgu import ReportingWindowAction, ReportingWindowBulkAction


core = get_core_module()


def submit_enterprise_report(body: EnterpriseReportSubmission):
    return core.submit_enterprise_report(body)


def get_enterprise_report_history(enterprise_id: str):
    return core.get_enterprise_report_history(enterprise_id)


def enterprise_request_maintenance(body: EnterpriseActionRequest):
    return core.enterprise_request_maintenance(body)


def enterprise_manual_log_correction(body: EnterpriseActionRequest):
    return core.enterprise_manual_log_correction(body)


def get_lgu_overview():
    return core.get_lgu_overview()


def get_lgu_reports(period: str | None = None, enterprise_id: str | None = None):
    return core.get_lgu_reports(period, enterprise_id)


def get_lgu_report_detail(report_id: str):
    return core.get_lgu_report_detail(report_id)


def generate_authority_package(report_id: str):
    return core.generate_authority_package(report_id)


def open_reporting_window(body: ReportingWindowAction):
    return core.open_reporting_window(body)


def close_reporting_window(body: ReportingWindowAction):
    return core.close_reporting_window(body)


def open_reporting_window_all(body: ReportingWindowBulkAction):
    return core.open_reporting_window_all(body)


def close_reporting_window_all(body: ReportingWindowBulkAction):
    return core.close_reporting_window_all(body)


def get_lgu_enterprise_accounts(period: str | None = None):
    return core.get_lgu_enterprise_accounts(period)
