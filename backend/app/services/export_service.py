from fastapi import Response

from domain_exceptions import DomainNotFoundError, DomainServiceUnavailableError

from app.core.supabase import is_supabase_available
from app.repositories import enterprise_repository, reporting_repository
from app.repositories.supabase_repositories import authority_package_repo, report_submission_repo, reporting_window_repo
from app.services.reporting_service import generate_authority_package


def _require_supabase() -> None:
    if not is_supabase_available():
        raise DomainServiceUnavailableError("Supabase is required for export workflows")


def export_enterprise_csv(enterprise_id: str):
    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    if not enterprise_repository.get_enterprise_account(resolved_id):
        raise DomainNotFoundError("Enterprise account not found")

    dashboard = enterprise_repository.get_dashboard_payload(enterprise_id=resolved_id)
    rows = ["date,time_slot,male_total,female_total,total"]
    for row in dashboard["detailed_detection_rows"]:
        total = row["male_total"] + row["female_total"]
        rows.append(f"{row['date']},{row['time_slot']},{row['male_total']},{row['female_total']},{total}")

    csv = "\n".join(rows)
    return Response(
        content=csv,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{resolved_id}_analytics.csv"'},
    )


def export_enterprise_pdf(enterprise_id: str):
    _require_supabase()

    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    profile = enterprise_repository.get_enterprise_profile(resolved_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")

    window = reporting_window_repo.get_by_enterprise_current(resolved_id) or reporting_window_repo.get_by_enterprise(resolved_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    dashboard = enterprise_repository.get_dashboard_payload(enterprise_id=resolved_id)
    lines = [
        f"{profile['company_name']} Monthly Tourism Report",
        f"Period: {window['period']}",
        f"Total Visitors MTD: {dashboard['key_stats']['total_visitors_mtd']}",
        f"Average Dwell Time: {dashboard['key_stats']['average_dwell_time']}",
        f"Peak Hours: {', '.join(dashboard['key_stats']['peak_visitor_hours'])}",
        f"Records Included: {len(dashboard['detailed_detection_rows'])}",
    ]
    mock_pdf = reporting_repository.build_minimal_pdf(lines)
    return Response(
        content=mock_pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{resolved_id}_monthly_report.pdf"'},
    )


def download_authority_package_pdf(report_id: str):
    _require_supabase()

    report = report_submission_repo.get_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")

    package = authority_package_repo.get_by_report(report_id)
    if package is None:
        package = generate_authority_package(report_id)

    stats = reporting_repository.compute_report_statistics(report)
    pdf_content = reporting_repository.build_professional_authority_pdf(report, package, stats)
    return Response(
        content=pdf_content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="authority_package_{report_id}.pdf"'},
    )


def download_authority_package_docx(report_id: str):
    _require_supabase()

    report = report_submission_repo.get_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")

    package = authority_package_repo.get_by_report(report_id)
    if package is None:
        package = generate_authority_package(report_id)

    stats = reporting_repository.compute_report_statistics(report)
    lines = [
        "LGU Authority Submission Package",
        f"Package ID: {package['authority_package_id']}",
        f"Enterprise: {report['enterprise_name']}",
        f"Period: {report['period']['month']}",
        f"Total Visitors (Computed): {stats['computed_total_visitors']}",
        f"Average Dwell: {package.get('executive_summary', {}).get('average_dwell', 'N/A')}",
        f"Records Included: {stats['records_included']}",
        f"Data Consistency: {stats['consistency_status']}",
    ]
    docx_content = reporting_repository.build_minimal_docx(lines)
    return Response(
        content=docx_content,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="authority_package_{report_id}.docx"'},
    )
