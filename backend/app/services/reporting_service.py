from datetime import datetime

from domain_exceptions import DomainConflictError, DomainForbiddenError, DomainNotFoundError

from app.repositories import enterprise_repository, reporting_repository
from app.schemas.enterprise import EnterpriseActionRequest, EnterpriseReportSubmission
from app.schemas.lgu import ReportingWindowAction, ReportingWindowBulkAction


def submit_enterprise_report(body: EnterpriseReportSubmission):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    window = enterprise_repository.get_reporting_window(body.enterprise_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    if enterprise["linked_lgu_id"] != enterprise_repository.get_archies_profile()["linked_lgu_id"]:
        raise DomainForbiddenError("Enterprise is not linked to this LGU")

    if window["status"] != "OPEN":
        raise DomainConflictError("Reporting window is currently CLOSED")

    report_pack = body.payload if body.payload else reporting_repository.build_report_pack(body.period, body.enterprise_id)
    if not body.payload:
        report_pack["period"]["month"] = body.period
        report_pack["enterprise_id"] = body.enterprise_id
        report_pack["enterprise_name"] = enterprise["company_name"]
        report_pack["linked_lgu_id"] = enterprise["linked_lgu_id"]
        report_pack["report_id"] = f"rpt_{body.enterprise_id}_{body.period.replace('-', '_')}"

    if not any(pack["report_id"] == report_pack["report_id"] for pack in reporting_repository.list_report_packs()):
        reporting_repository.add_report_pack(report_pack)

    window["status"] = "SUBMITTED"
    return {
        "message": "Report submitted successfully to linked LGU account",
        "report_id": report_pack["report_id"],
        "status": "SUBMITTED",
    }


def get_enterprise_report_history(enterprise_id: str):
    enterprise = enterprise_repository.get_enterprise_account(enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    reports = [item for item in reporting_repository.list_report_packs() if item.get("enterprise_id") == target_id]
    reports_sorted = sorted(reports, key=lambda item: item.get("submitted_at", ""), reverse=True)
    return {
        "enterprise_id": target_id,
        "reports": reports_sorted,
    }


def enterprise_request_maintenance(body: EnterpriseActionRequest):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    ticket = {
        "ticket_id": f"mnt_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "enterprise_id": body.enterprise_id,
        "type": "maintenance",
        "message": body.message or "General CCTV / AI service check requested.",
        "created_at": datetime.now().strftime("%Y-%m-%d %I:%M %p PST"),
    }
    reporting_repository.list_action_logs().append(ticket)
    return {
        "message": "Maintenance request submitted.",
        "ticket": ticket,
    }


def enterprise_manual_log_correction(body: EnterpriseActionRequest):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    ticket = {
        "ticket_id": f"mlc_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "enterprise_id": body.enterprise_id,
        "type": "manual-log-correction",
        "message": body.message or "Manual detection log correction requested.",
        "created_at": datetime.now().strftime("%Y-%m-%d %I:%M %p PST"),
    }
    reporting_repository.list_action_logs().append(ticket)
    return {
        "message": "Manual log correction request submitted.",
        "ticket": ticket,
    }


def get_lgu_overview():
    reporting_windows = {
        item["enterprise_id"]: enterprise_repository.get_reporting_window(item["enterprise_id"])
        for item in enterprise_repository.list_enterprise_accounts()
    }
    submitted = sum(1 for item in reporting_windows.values() if item and item["status"] == "SUBMITTED")
    total_enterprises = len(enterprise_repository.list_enterprise_accounts())
    active = enterprise_repository.get_reporting_window(enterprise_repository.get_archies_profile()["enterprise_id"])
    if not active:
        raise DomainNotFoundError("Enterprise reporting window not found")

    return {
        "lgu_id": "lgu_san_pedro_001",
        "name": "San Pedro LGU",
        "total_linked_enterprises": total_enterprises,
        "submitted_reports_current_period": submitted,
        "submission_completion_rate_pct": round((submitted / total_enterprises) * 100, 2),
        "active_reporting_window": active,
    }


def get_lgu_reports(period: str | None = None, enterprise_id: str | None = None):
    packs = reporting_repository.list_report_packs()

    if period:
        packs = [item for item in packs if item.get("period", {}).get("month") == period]

    if enterprise_id:
        target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
        packs = [item for item in packs if item.get("enterprise_id") == target_id]

    return {"reports": packs}


def get_lgu_report_detail(report_id: str):
    report = reporting_repository.get_report_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")
    return report


def generate_authority_package(report_id: str):
    report = reporting_repository.get_report_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")

    stats = reporting_repository.compute_report_statistics(report)
    avg_dwell = report.get("kpis", {}).get("avg_dwell") or f"{stats['avg_dwell_minutes'] // 60}h {stats['avg_dwell_minutes'] % 60}m"

    package = {
        "authority_package_id": f"auth_{report_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "generated_at": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p PST"),
        "classification": "READY_FOR_HIGHER_AUTHORITY_SUBMISSION",
        "executive_summary": {
            "enterprise": report["enterprise_name"],
            "period": report["period"]["month"],
            "total_visitors": stats["computed_total_visitors"],
            "average_dwell": avg_dwell,
            "top_peak_hours": stats["top_peak_hours"] or report.get("kpis", {}).get("peak_visitor_hours", []),
        },
        "compliance_notes": [
            "AI detections include sex and residence classification categories.",
            "Monthly report generated under LGU-opened reporting window.",
            f"Records included: {stats['records_included']}",
            f"Data consistency check: {stats['consistency_status']}",
        ],
        "attachments": [
            "enterprise_monthly_pdf",
            "detailed_detection_csv",
            "demographic_visual_summary",
            "audit_trail",
        ],
    }

    reporting_repository.list_authority_packages()[report_id] = package
    return package


def open_reporting_window(body: ReportingWindowAction):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    window = enterprise_repository.get_reporting_window(body.enterprise_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    window["period"] = body.period
    window["status"] = "OPEN"
    window["opened_at"] = datetime.now().strftime("%Y-%m-%dT%H:%M:%S-08:00")
    window["opened_by"] = "lgu_admin_01"
    return window


def close_reporting_window(body: ReportingWindowAction):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    window = enterprise_repository.get_reporting_window(body.enterprise_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    window["period"] = body.period
    window["status"] = "CLOSED"
    return window


def open_reporting_window_all(body: ReportingWindowBulkAction):
    now = datetime.now().strftime("%Y-%m-%dT%H:%M:%S-08:00")
    total = 0
    for item in enterprise_repository.list_enterprise_accounts():
        window = enterprise_repository.get_reporting_window(item["enterprise_id"])
        if not window:
            continue
        total += 1
        window["period"] = body.period
        window["status"] = "OPEN"
        window["opened_at"] = now
        window["opened_by"] = "lgu_admin_01"

    return {
        "message": "All enterprise reporting windows are OPEN",
        "period": body.period,
        "total_enterprises": total,
    }


def close_reporting_window_all(body: ReportingWindowBulkAction):
    total = 0
    for item in enterprise_repository.list_enterprise_accounts():
        window = enterprise_repository.get_reporting_window(item["enterprise_id"])
        if not window:
            continue
        total += 1
        window["period"] = body.period
        window["status"] = "CLOSED"

    return {
        "message": "All enterprise reporting windows are CLOSED",
        "period": body.period,
        "total_enterprises": total,
    }


def get_lgu_enterprise_accounts(period: str | None = None):
    target_period = period or "2026-03"
    accounts = []
    for item in enterprise_repository.list_enterprise_accounts():
        window = enterprise_repository.get_reporting_window(item["enterprise_id"])
        if not window:
            raise DomainNotFoundError("Enterprise reporting window not found")

        has_report = any(
            report.get("enterprise_id") == item["enterprise_id"]
            and report.get("period", {}).get("month") == target_period
            for report in reporting_repository.list_report_packs()
        )

        accounts.append(
            {
                **item,
                "period": window["period"],
                "reporting_window_status": window["status"],
                "has_submitted_for_period": has_report,
            }
        )

    return {
        "accounts": accounts,
        "period": target_period,
    }
