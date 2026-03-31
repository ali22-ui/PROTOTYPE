from datetime import datetime

from domain_exceptions import DomainConflictError, DomainForbiddenError, DomainNotFoundError

from app.core.supabase import is_supabase_available
from app.repositories import enterprise_repository, reporting_repository
from app.repositories.supabase_repositories import (
    authority_package_repo,
    enterprise_action_repo,
    report_submission_repo,
    reporting_window_repo,
    audit_log_repo,
)
from app.schemas.enterprise import EnterpriseActionRequest, EnterpriseReportSubmission
from app.schemas.lgu import ReportingWindowAction, ReportingWindowBulkAction


def submit_enterprise_report(body: EnterpriseReportSubmission):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    # Check reporting window - prefer Supabase, fallback to runtime
    if is_supabase_available():
        window = reporting_window_repo.get_by_enterprise(body.enterprise_id, body.period)
        if not window:
            window = reporting_window_repo.get_by_enterprise_current(body.enterprise_id)
    else:
        window = enterprise_repository.get_reporting_window(body.enterprise_id)
    
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    if enterprise["linked_lgu_id"] != enterprise_repository.get_archies_profile()["linked_lgu_id"]:
        raise DomainForbiddenError("Enterprise is not linked to this LGU")

    # Check if window allows submission
    open_statuses = ("OPEN", "REMIND", "WARN", "RENOTIFY")
    if window["status"] not in open_statuses:
        raise DomainConflictError("Reporting window is currently CLOSED")

    # Build report pack
    report_pack = body.payload if body.payload else reporting_repository.build_report_pack(body.period, body.enterprise_id)
    if not body.payload:
        report_pack["period"]["month"] = body.period
        report_pack["enterprise_id"] = body.enterprise_id
        report_pack["enterprise_name"] = enterprise["company_name"]
        report_pack["linked_lgu_id"] = enterprise["linked_lgu_id"]
        report_pack["report_id"] = f"rpt_{body.enterprise_id}_{body.period.replace('-', '_')}"

    # Persist to Supabase if available
    if is_supabase_available():
        # Create or update report submission
        report_submission_repo.upsert(
            enterprise_id=body.enterprise_id,
            period=body.period,
            enterprise_name=enterprise["company_name"],
            linked_lgu_id=enterprise.get("linked_lgu_id"),
            status="SUBMITTED",
            payload=report_pack,
            submitted_by=body.enterprise_id,
        )
        # Mark reporting window as submitted
        reporting_window_repo.mark_submitted(body.enterprise_id, body.period)
        # Audit log
        audit_log_repo.log(
            entity_type="report",
            entity_id=report_pack["report_id"],
            action="submit",
            actor_id=body.enterprise_id,
            actor_type="enterprise",
            new_value={"period": body.period, "status": "SUBMITTED"},
        )
    else:
        # Fallback to in-memory (legacy)
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
    
    # Prefer Supabase for report history
    if is_supabase_available():
        reports = report_submission_repo.list_by_enterprise(target_id)
    else:
        reports = [item for item in reporting_repository.list_report_packs() if item.get("enterprise_id") == target_id]
        reports = sorted(reports, key=lambda item: item.get("submitted_at", ""), reverse=True)
    
    return {
        "enterprise_id": target_id,
        "reports": reports,
    }


def enterprise_request_maintenance(body: EnterpriseActionRequest):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    message = body.message or "General CCTV / AI service check requested."
    
    # Persist to Supabase if available
    if is_supabase_available():
        ticket = enterprise_action_repo.create(
            enterprise_id=body.enterprise_id,
            ticket_type="maintenance",
            message=message,
        )
    else:
        ticket = {
            "ticket_id": f"mnt_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "enterprise_id": body.enterprise_id,
            "type": "maintenance",
            "message": message,
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

    message = body.message or "Manual detection log correction requested."
    
    # Persist to Supabase if available
    if is_supabase_available():
        ticket = enterprise_action_repo.create(
            enterprise_id=body.enterprise_id,
            ticket_type="manual-log-correction",
            message=message,
        )
    else:
        ticket = {
            "ticket_id": f"mlc_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "enterprise_id": body.enterprise_id,
            "type": "manual-log-correction",
            "message": message,
            "created_at": datetime.now().strftime("%Y-%m-%d %I:%M %p PST"),
        }
        reporting_repository.list_action_logs().append(ticket)
    
    return {
        "message": "Manual log correction request submitted.",
        "ticket": ticket,
    }


def get_lgu_overview():
    total_enterprises = len(enterprise_repository.list_enterprise_accounts())
    
    if is_supabase_available():
        # Get current period windows from Supabase
        current_period = datetime.now().strftime("%Y-%m")
        windows = reporting_window_repo.list_by_period(current_period)
        submitted = sum(1 for w in windows if w.get("status") == "SUBMITTED")
        active = reporting_window_repo.get_by_enterprise_current(
            enterprise_repository.get_archies_profile()["enterprise_id"]
        )
    else:
        reporting_windows = {
            item["enterprise_id"]: enterprise_repository.get_reporting_window(item["enterprise_id"])
            for item in enterprise_repository.list_enterprise_accounts()
        }
        submitted = sum(1 for item in reporting_windows.values() if item and item["status"] == "SUBMITTED")
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
    if is_supabase_available():
        if enterprise_id:
            target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
            reports = report_submission_repo.list_by_period(period, target_id) if period else report_submission_repo.list_by_enterprise(target_id)
        elif period:
            reports = report_submission_repo.list_by_period(period)
        else:
            reports = report_submission_repo.list_all()
        return {"reports": reports}
    else:
        packs = reporting_repository.list_report_packs()
        if period:
            packs = [item for item in packs if item.get("period", {}).get("month") == period]
        if enterprise_id:
            target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
            packs = [item for item in packs if item.get("enterprise_id") == target_id]
        return {"reports": packs}


def get_lgu_report_detail(report_id: str):
    if is_supabase_available():
        report = report_submission_repo.get_by_id(report_id)
        if report:
            return report
    # Fallback to in-memory
    report = reporting_repository.get_report_by_id(report_id)
    if not report:
        raise DomainNotFoundError("Report not found")
    return report


def generate_authority_package(report_id: str):
    # Try Supabase first, then in-memory
    if is_supabase_available():
        report = report_submission_repo.get_by_id(report_id)
    else:
        report = None
    
    if not report:
        report = reporting_repository.get_report_by_id(report_id)
    
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

    if is_supabase_available():
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
    else:
        package = {
            "authority_package_id": f"auth_{report_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "generated_at": datetime.now().strftime("%Y-%m-%d %I:%M:%S %p PST"),
            "classification": "READY_FOR_HIGHER_AUTHORITY_SUBMISSION",
            "executive_summary": executive_summary,
            "compliance_notes": compliance_notes,
            "attachments": attachments,
        }
        reporting_repository.list_authority_packages()[report_id] = package
    
    return package


def open_reporting_window(body: ReportingWindowAction):
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    if is_supabase_available():
        window = reporting_window_repo.open_window(
            enterprise_id=body.enterprise_id,
            period=body.period,
            opened_by="lgu_admin_01",
        )
        audit_log_repo.log(
            entity_type="reporting_window",
            entity_id=f"{body.enterprise_id}_{body.period}",
            action="open",
            actor_type="lgu_admin",
            new_value={"status": "OPEN", "period": body.period},
        )
        return window
    else:
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

    if is_supabase_available():
        window = reporting_window_repo.close_window(
            enterprise_id=body.enterprise_id,
            period=body.period,
            closed_by="lgu_admin_01",
        )
        audit_log_repo.log(
            entity_type="reporting_window",
            entity_id=f"{body.enterprise_id}_{body.period}",
            action="close",
            actor_type="lgu_admin",
            new_value={"status": "CLOSED", "period": body.period},
        )
        return window
    else:
        window = enterprise_repository.get_reporting_window(body.enterprise_id)
        if not window:
            raise DomainNotFoundError("Enterprise reporting window not found")
        window["period"] = body.period
        window["status"] = "CLOSED"
        return window


def open_reporting_window_all(body: ReportingWindowBulkAction):
    if is_supabase_available():
        total = reporting_window_repo.open_all(body.period, "lgu_admin_01")
        audit_log_repo.log(
            entity_type="reporting_window",
            entity_id=f"all_{body.period}",
            action="open_all",
            actor_type="lgu_admin",
            new_value={"status": "OPEN", "period": body.period, "count": total},
        )
    else:
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
    if is_supabase_available():
        total = reporting_window_repo.close_all(body.period, "lgu_admin_01")
        audit_log_repo.log(
            entity_type="reporting_window",
            entity_id=f"all_{body.period}",
            action="close_all",
            actor_type="lgu_admin",
            new_value={"status": "CLOSED", "period": body.period, "count": total},
        )
    else:
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
    target_period = period or datetime.now().strftime("%Y-%m")
    accounts = []
    
    for item in enterprise_repository.list_enterprise_accounts():
        if is_supabase_available():
            window = reporting_window_repo.get_by_enterprise(item["enterprise_id"], target_period)
            if not window:
                window = reporting_window_repo.get_by_enterprise_current(item["enterprise_id"])
            has_report = report_submission_repo.exists(item["enterprise_id"], target_period)
        else:
            window = enterprise_repository.get_reporting_window(item["enterprise_id"])
            has_report = any(
                report.get("enterprise_id") == item["enterprise_id"]
                and report.get("period", {}).get("month") == target_period
                for report in reporting_repository.list_report_packs()
            )
        
        if not window:
            # Create a default closed window if none exists
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
