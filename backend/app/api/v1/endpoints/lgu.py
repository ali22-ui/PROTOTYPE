from fastapi import APIRouter

from app.schemas.lgu import ReportingWindowAction, ReportingWindowBulkAction
from app.services.export_service import download_authority_package_docx as download_authority_package_docx_service
from app.services.export_service import download_authority_package_pdf as download_authority_package_pdf_service
from app.services.reporting_service import close_reporting_window as close_reporting_window_service
from app.services.reporting_service import close_reporting_window_all as close_reporting_window_all_service
from app.services.reporting_service import generate_authority_package as generate_authority_package_service
from app.services.reporting_service import get_lgu_enterprise_accounts as get_lgu_enterprise_accounts_service
from app.services.reporting_service import get_lgu_overview as get_lgu_overview_service
from app.services.reporting_service import get_lgu_report_detail as get_lgu_report_detail_service
from app.services.reporting_service import get_lgu_reports as get_lgu_reports_service
from app.services.reporting_service import open_reporting_window as open_reporting_window_service
from app.services.reporting_service import open_reporting_window_all as open_reporting_window_all_service

router = APIRouter(tags=["LGU"])


@router.get("/lgu/overview")
def get_lgu_overview():
    return get_lgu_overview_service()


@router.get("/lgu/reports")
def get_lgu_reports(
    period: str | None = None,
    enterprise_id: str | None = None,
):
    return get_lgu_reports_service(period, enterprise_id)


@router.get("/lgu/reports/{report_id}")
def get_lgu_report_detail(report_id: str):
    return get_lgu_report_detail_service(report_id)


@router.post("/lgu/reports/{report_id}/generate-authority-package")
def generate_authority_package(report_id: str):
    return generate_authority_package_service(report_id)


@router.post("/lgu/reports/{report_id}/authority-package/pdf")
def download_authority_package_pdf(report_id: str):
    return download_authority_package_pdf_service(report_id)


@router.post("/lgu/reports/{report_id}/authority-package/docx")
def download_authority_package_docx(report_id: str):
    return download_authority_package_docx_service(report_id)


@router.post("/lgu/reporting-window/open")
def open_reporting_window(
    body: ReportingWindowAction,
):
    return open_reporting_window_service(body)


@router.post("/lgu/reporting-window/close")
def close_reporting_window(
    body: ReportingWindowAction,
):
    return close_reporting_window_service(body)


@router.post("/lgu/reporting-window/open-all")
def open_reporting_window_all(
    body: ReportingWindowBulkAction,
):
    return open_reporting_window_all_service(body)


@router.post("/lgu/reporting-window/close-all")
def close_reporting_window_all(
    body: ReportingWindowBulkAction,
):
    return close_reporting_window_all_service(body)


@router.get("/lgu/enterprise-accounts")
def get_lgu_enterprise_accounts(
    period: str | None = None,
):
    return get_lgu_enterprise_accounts_service(period)
