from fastapi import APIRouter

from app.schemas.enterprise import EnterpriseActionRequest, EnterpriseReportSubmission
from app.services.analytics_service import get_enterprise_analytics as get_enterprise_analytics_service
from app.services.analytics_service import get_enterprises as get_enterprises_service
from app.services.enterprise_service import get_enterprise_accounts as get_enterprise_accounts_service
from app.services.enterprise_service import get_enterprise_dashboard as get_enterprise_dashboard_service
from app.services.enterprise_service import get_enterprise_profile as get_enterprise_profile_service
from app.services.enterprise_service import get_reporting_window_status as get_reporting_window_status_service
from app.services.export_service import export_enterprise_csv as export_enterprise_csv_service
from app.services.export_service import export_enterprise_pdf as export_enterprise_pdf_service
from app.services.reporting_service import enterprise_manual_log_correction as enterprise_manual_log_correction_service
from app.services.reporting_service import enterprise_request_maintenance as enterprise_request_maintenance_service
from app.services.reporting_service import get_enterprise_report_history as get_enterprise_report_history_service
from app.services.reporting_service import submit_enterprise_report as submit_enterprise_report_service

router = APIRouter(tags=["Enterprise"])


@router.get("/enterprises")
def get_enterprises():
    return get_enterprises_service()


@router.get("/enterprises/{enterprise_id}/analytics")
def get_enterprise_analytics(enterprise_id: int):
    return get_enterprise_analytics_service(enterprise_id)


@router.get("/enterprise/profile")
def get_enterprise_profile_endpoint(
    enterprise_id: str = "ent_archies_001",
):
    return get_enterprise_profile_service(enterprise_id)


@router.get("/enterprise/accounts")
def get_enterprise_accounts():
    return get_enterprise_accounts_service()


@router.get("/enterprise/dashboard")
def get_enterprise_dashboard(
    date: str | None = None,
    enterprise_id: str = "ent_archies_001",
):
    return get_enterprise_dashboard_service(date, enterprise_id)


@router.get("/enterprise/reporting-window-status")
def get_reporting_window_status(
    enterprise_id: str = "ent_archies_001",
):
    return get_reporting_window_status_service(enterprise_id)


@router.post("/enterprise/export/csv")
def export_enterprise_csv(
    enterprise_id: str = "ent_archies_001",
):
    return export_enterprise_csv_service(enterprise_id)


@router.post("/enterprise/export/pdf")
def export_enterprise_pdf(
    enterprise_id: str = "ent_archies_001",
):
    return export_enterprise_pdf_service(enterprise_id)


@router.post("/enterprise/reports/submit")
def submit_enterprise_report(
    body: EnterpriseReportSubmission,
):
    return submit_enterprise_report_service(body)


@router.post("/enterprise/actions/request-maintenance")
def enterprise_request_maintenance(
    body: EnterpriseActionRequest,
):
    return enterprise_request_maintenance_service(body)


@router.post("/enterprise/actions/manual-log-correction")
def enterprise_manual_log_correction(
    body: EnterpriseActionRequest,
):
    return enterprise_manual_log_correction_service(body)


@router.get("/enterprise/reports/history")
def get_enterprise_report_history(
    enterprise_id: str = "ent_archies_001",
):
    return get_enterprise_report_history_service(enterprise_id)
