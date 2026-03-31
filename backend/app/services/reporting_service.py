from datetime import datetime

from domain_exceptions import (
    DomainConflictError,
    DomainForbiddenError,
    DomainNotFoundError,
    DomainServiceUnavailableError,
)

from app.core.supabase import is_supabase_available
from app.repositories import enterprise_repository, reporting_repository
from app.repositories.supabase_repositories import (
    authority_package_repo,
    enterprise_action_repo,
    report_submission_repo,
    reporting_window_repo,
    system_settings_repo,
    audit_log_repo,
)
from app.schemas.enterprise import EnterpriseActionRequest, EnterpriseReportSubmission
from app.schemas.lgu import ReportingWindowAction, ReportingWindowBulkAction


def _require_supabase() -> None:
    if not is_supabase_available():
        raise DomainServiceUnavailableError("Supabase is required for reporting workflows")


def _resolve_reporting_window(enterprise_id: str, period: str | None = None) -> dict | None:
    if period:
        window = reporting_window_repo.get_by_enterprise(enterprise_id, period)
        if window:
            return window
    return reporting_window_repo.get_by_enterprise_current(enterprise_id) or reporting_window_repo.get_by_enterprise(enterprise_id)


def _is_global_reporting_window_open() -> bool:
    state = system_settings_repo.get_reporting_window_state()
    return bool(state.get("is_reporting_window_open", False))


def submit_enterprise_report(body: EnterpriseReportSubmission):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    window = _resolve_reporting_window(body.enterprise_id, body.period)
    is_global_open = _is_global_reporting_window_open()

    if not window and not is_global_open:
        raise DomainNotFoundError("Enterprise reporting window not found")

    if enterprise["linked_lgu_id"] != enterprise_repository.get_archies_profile()["linked_lgu_id"]:
        raise DomainForbiddenError("Enterprise is not linked to this LGU")

    # Check if window allows submission
    open_statuses = ("OPEN", "REMIND", "WARN", "RENOTIFY")
    window_status = (window or {}).get("status")
    if not is_global_open and window_status not in open_statuses:
        raise DomainConflictError("Reporting window is currently CLOSED")

    if is_global_open and window_status not in open_statuses:
        reporting_window_repo.open_window(
            enterprise_id=body.enterprise_id,
            period=body.period,
            opened_by="lgu_admin_01",
            message="Opened via global reporting window control.",
            status="OPEN",
        )

    # Build report pack
    report_pack = body.payload if body.payload else reporting_repository.build_report_pack(body.period, body.enterprise_id)
    if not body.payload:
        report_pack["period"]["month"] = body.period
        report_pack["enterprise_id"] = body.enterprise_id
        report_pack["enterprise_name"] = enterprise["company_name"]
        report_pack["linked_lgu_id"] = enterprise["linked_lgu_id"]
        report_pack["report_id"] = f"rpt_{body.enterprise_id}_{body.period.replace('-', '_')}"

    report_submission_repo.upsert(
        enterprise_id=body.enterprise_id,
        period=body.period,
        enterprise_name=enterprise["company_name"],
        linked_lgu_id=enterprise.get("linked_lgu_id"),
        status="SUBMITTED",
        payload=report_pack,
        submitted_by=body.enterprise_id,
    )
    reporting_window_repo.mark_submitted(body.enterprise_id, body.period)
    audit_log_repo.log(
        entity_type="report",
        entity_id=report_pack["report_id"],
        action="submit",
        actor_id=body.enterprise_id,
        actor_type="enterprise",
        new_value={"period": body.period, "status": "SUBMITTED"},
    )

    return {
        "message": "Report submitted successfully to linked LGU account",
        "report_id": report_pack["report_id"],
        "status": "SUBMITTED",
    }


def get_enterprise_report_history(enterprise_id: str):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    reports = report_submission_repo.list_by_enterprise(target_id)
    
    return {
        "enterprise_id": target_id,
        "reports": reports,
    }


def enterprise_request_maintenance(body: EnterpriseActionRequest):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    message = body.message or "General CCTV / AI service check requested."
    ticket = enterprise_action_repo.create(
        enterprise_id=body.enterprise_id,
        ticket_type="maintenance",
        message=message,
    )
    
    return {
        "message": "Maintenance request submitted.",
        "ticket": ticket,
    }


def enterprise_manual_log_correction(body: EnterpriseActionRequest):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    message = body.message or "Manual detection log correction requested."
    ticket = enterprise_action_repo.create(
        enterprise_id=body.enterprise_id,
        ticket_type="manual-log-correction",
        message=message,
    )
    
    return {
        "message": "Manual log correction request submitted.",
        "ticket": ticket,
    }


def get_lgu_overview():
    _require_supabase()

    total_enterprises = len(enterprise_repository.list_enterprise_accounts())

    current_period = datetime.now().strftime("%Y-%m")
    windows = reporting_window_repo.list_by_period(current_period)
    submitted = sum(1 for w in windows if w.get("status") == "SUBMITTED")
    active = reporting_window_repo.get_by_enterprise_current(
        enterprise_repository.get_archies_profile()["enterprise_id"]
    )

    if not active:
        active = {
            "enterprise_id": enterprise_repository.get_archies_profile()["enterprise_id"],
            "period": current_period,
            "status": "CLOSED",
            "opened_at": None,
            "opened_by": None,
        }

    return {
        "lgu_id": "lgu_san_pedro_001",
        "name": "San Pedro LGU",
        "total_linked_enterprises": total_enterprises,
        "submitted_reports_current_period": submitted,
        "submission_completion_rate_pct": round((submitted / total_enterprises) * 100, 2),
        "active_reporting_window": active,
    }


def get_lgu_reports(period: str | None = None, enterprise_id: str | None = None):
    _require_supabase()

    if enterprise_id:
        target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
        reports = report_submission_repo.list_by_period(period, target_id) if period else report_submission_repo.list_by_enterprise(target_id)
    elif period:
        reports = report_submission_repo.list_by_period(period)
    else:
        reports = report_submission_repo.list_all()

    return {"reports": reports}


def get_lgu_report_detail(report_id: str):
    _require_supabase()

    report = report_submission_repo.get_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")
    return report


def generate_authority_package(report_id: str):
    _require_supabase()

    report = report_submission_repo.get_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")

    stats = reporting_repository.compute_report_statistics(report)
    kpis = report.get("kpis", {})
    avg_dwell = kpis.get("avg_dwell") or f"{stats['avg_dwell_minutes'] // 60}h {stats['avg_dwell_minutes'] % 60}m"
    
    period = report.get("period", {})
    period_month = period.get("month") if isinstance(period, dict) else period

    executive_summary = {
        "enterprise": report.get("enterprise_name"),
        "period": period_month,
        "total_visitors": stats["computed_total_visitors"],
        "average_dwell": avg_dwell,
        "top_peak_hours": stats["top_peak_hours"] or kpis.get("peak_visitor_hours", []),
    }
    
    compliance_notes = [
        "AI detections include sex and residence classification categories.",
        "Monthly report generated under LGU-opened reporting window.",
        f"Records included: {stats['records_included']}",
        f"Data consistency check: {stats['consistency_status']}",
    ]
    
    attachments = [
        "enterprise_monthly_pdf",
        "detailed_detection_csv",
        "demographic_visual_summary",
        "audit_trail",
    ]

    package = authority_package_repo.create(
        report_id=report_id,
        enterprise_id=report.get("enterprise_id"),
        period=period_month,
        executive_summary=executive_summary,
        compliance_notes=compliance_notes,
        attachments=attachments,
    )
    audit_log_repo.log(
        entity_type="authority_package",
        entity_id=package.get("authority_package_id"),
        action="create",
        actor_type="lgu_admin",
        new_value={"report_id": report_id},
    )
    
    return package


def open_reporting_window(body: ReportingWindowAction):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    status = (body.status or "OPEN").upper()
    if status not in ("OPEN", "REMIND", "WARN", "RENOTIFY"):
        raise DomainConflictError("Invalid reporting window status for open action")

    window = reporting_window_repo.open_window(
        enterprise_id=body.enterprise_id,
        period=body.period,
        opened_by="lgu_admin_01",
        message=body.message,
        status=status,
    )
    audit_log_repo.log(
        entity_type="reporting_window",
        entity_id=f"{body.enterprise_id}_{body.period}",
        action="open",
        actor_type="lgu_admin",
        new_value={"status": status, "period": body.period},
    )
    return window


def close_reporting_window(body: ReportingWindowAction):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    window = reporting_window_repo.close_window(
        enterprise_id=body.enterprise_id,
        period=body.period,
        closed_by="lgu_admin_01",
        message=body.message,
    )
    audit_log_repo.log(
        entity_type="reporting_window",
        entity_id=f"{body.enterprise_id}_{body.period}",
        action="close",
        actor_type="lgu_admin",
        new_value={"status": "CLOSED", "period": body.period},
    )
    return window


def open_reporting_window_all(body: ReportingWindowBulkAction):
    _require_supabase()

    status = (body.status or "OPEN").upper()
    if status in ("OPEN", "REMIND", "WARN", "RENOTIFY"):
        count = 0
        for item in enterprise_repository.list_enterprise_accounts():
            reporting_window_repo.open_window(
                enterprise_id=item["enterprise_id"],
                period=body.period,
                opened_by="lgu_admin_01",
                message=body.message,
                status=status,
            )
            count += 1
        total = count
    else:
        raise DomainConflictError("Invalid reporting window status for open-all action")

    audit_log_repo.log(
        entity_type="reporting_window",
        entity_id=f"all_{body.period}",
        action="open_all",
        actor_type="lgu_admin",
        new_value={"status": status, "period": body.period, "count": total},
    )

    system_settings_repo.set_reporting_window_open(
        is_open=True,
        updated_by="lgu_admin_01",
    )

    return {
        "message": "All enterprise reporting windows are OPEN",
        "period": body.period,
        "total_enterprises": total,
    }


def close_reporting_window_all(body: ReportingWindowBulkAction):
    _require_supabase()

    total = reporting_window_repo.close_all(body.period, "lgu_admin_01")
    audit_log_repo.log(
        entity_type="reporting_window",
        entity_id=f"all_{body.period}",
        action="close_all",
        actor_type="lgu_admin",
        new_value={"status": "CLOSED", "period": body.period, "count": total},
    )

    system_settings_repo.set_reporting_window_open(
        is_open=False,
        updated_by="lgu_admin_01",
    )

    return {
        "message": "All enterprise reporting windows are CLOSED",
        "period": body.period,
        "total_enterprises": total,
    }


def get_lgu_enterprise_accounts(period: str | None = None):
    _require_supabase()

    target_period = period or datetime.now().strftime("%Y-%m")
    accounts = []

    for item in enterprise_repository.list_enterprise_accounts():
        window = reporting_window_repo.get_by_enterprise(item["enterprise_id"], target_period)
        if not window:
            window = reporting_window_repo.get_by_enterprise_current(item["enterprise_id"])
        has_report = report_submission_repo.exists(item["enterprise_id"], target_period)

        if not window:
            window = {"period": target_period, "status": "CLOSED"}

        accounts.append(
            {
                **item,
                "period": window.get("period", target_period),
                "reporting_window_status": window.get("status", "CLOSED"),
                "has_submitted_for_period": has_report,
            }
        )

    return {
        "accounts": accounts,
        "period": target_period,
    }
