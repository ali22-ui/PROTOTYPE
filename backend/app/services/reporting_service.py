from datetime import datetime
import logging

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


logger = logging.getLogger(__name__)


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
    """Submit enterprise report with graceful fallback when Supabase is unavailable."""
    supabase_available = is_supabase_available()
    
    enterprise = enterprise_repository.get_enterprise_account(body.enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    # For non-Supabase mode, skip window validation and allow submission
    window = None
    is_global_open = True  # Default to open when Supabase is unavailable
    
    if supabase_available:
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

    # Extract KPIs from payload summary if passed, otherwise use direct fields
    payload_summary = (body.payload or {}).get("summary", {})
    total_visitors = body.total_visitors or payload_summary.get("total_visitors", 0)
    male_count = body.male_count or payload_summary.get("male_count", 0)
    female_count = body.female_count or payload_summary.get("female_count", 0)
    row_count = body.row_count or (body.payload or {}).get("rows", 0)

    # Store to Supabase if available, otherwise store in runtime
    if supabase_available:
        try:
            report_submission_repo.upsert(
                enterprise_id=body.enterprise_id,
                period=body.period,
                linked_lgu_id=enterprise.get("linked_lgu_id"),
                status="SUBMITTED",
                submitted_by=body.enterprise_id,
                total_visitors=total_visitors,
                male_count=male_count,
                female_count=female_count,
                row_count=row_count,
                notes=body.notes,
            )
            reporting_window_repo.mark_submitted(body.enterprise_id, body.period)
        except Exception as e:
            logger.warning(f"Supabase upsert failed, falling back to runtime: {e}")
            # Fallback: store in runtime
            _store_report_in_runtime(body, report_pack, total_visitors, male_count, female_count, row_count)
    else:
        # Store in runtime when Supabase is not available
        _store_report_in_runtime(body, report_pack, total_visitors, male_count, female_count, row_count)
        logger.info(f"Report stored in runtime for {body.enterprise_id} (Supabase unavailable)")
    
    # Update enterprise compliance_status to 'Compliant' after successful submission
    try:
        enterprise_repository.update_compliance_status(body.enterprise_id, "Compliant")
        logger.info(f"Updated compliance_status to Compliant for enterprise {body.enterprise_id}")
    except Exception as e:
        logger.warning(f"Failed to update compliance_status for {body.enterprise_id}: {e}")
    
    # Log audit if Supabase is available
    if supabase_available:
        try:
            audit_log_repo.log(
                entity_type="report",
                entity_id=report_pack["report_id"],
                action="submit",
                actor_id=body.enterprise_id,
                actor_type="enterprise",
                new_value={"period": body.period, "status": "SUBMITTED", "total_visitors": total_visitors},
            )
        except Exception as e:
            logger.warning(f"Audit log failed: {e}")

    return {
        "message": "Report submitted successfully to linked LGU account",
        "report_id": report_pack["report_id"],
        "status": "SUBMITTED",
    }


def _store_report_in_runtime(body: EnterpriseReportSubmission, report_pack: dict, total_visitors: int, male_count: int, female_count: int, row_count: int):
    """Store report submission in runtime memory when Supabase is unavailable."""
    from app.state import runtime_store
    
    report_id = report_pack.get("report_id", f"rpt_{body.enterprise_id}_{body.period.replace('-', '_')}")
    runtime_report = {
        "report_id": report_id,
        "enterprise_id": body.enterprise_id,
        "enterprise_name": report_pack.get("enterprise_name", ""),
        "linked_lgu_id": report_pack.get("linked_lgu_id"),
        "period": {"month": body.period},
        "status": "SUBMITTED",
        "submitted_at": datetime.now().isoformat(),
        "submitted_by": body.enterprise_id,
        "kpis": {
            "total_visitors": total_visitors,
            "male_count": male_count,
            "female_count": female_count,
        },
        "row_count": row_count,
    }
    
    # Store in runtime store
    reports = runtime_store.get_submitted_reports()
    reports[report_id] = runtime_report
    runtime_store.set_submitted_reports(reports)


def get_enterprise_report_history(enterprise_id: str):
    _require_supabase()

    enterprise = enterprise_repository.get_enterprise_account(enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    try:
        reports = report_submission_repo.list_by_enterprise(target_id)
    except DomainServiceUnavailableError:
        reports = []
    
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
    warnings: list[str] = []

    current_period = datetime.now().strftime("%Y-%m")
    try:
        windows = reporting_window_repo.list_by_period(current_period)
    except Exception as exc:
        logger.warning("Failed to load reporting windows for overview: %s", exc, exc_info=True)
        windows = []
        warnings.append("Reporting window data is currently degraded; showing partial overview metrics.")

    submitted = sum(1 for w in windows if w.get("status") == "SUBMITTED")
    target_enterprise_id = enterprise_repository.get_archies_profile()["enterprise_id"]

    try:
        active = reporting_window_repo.get_by_enterprise_current(target_enterprise_id)
    except Exception as exc:
        logger.warning("Failed to load active reporting window for overview: %s", exc, exc_info=True)
        active = enterprise_repository.get_reporting_window(target_enterprise_id)

    if not active:
        active = {
            "enterprise_id": target_enterprise_id,
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
        "warning": " ".join(dict.fromkeys(warnings)) if warnings else None,
    }


def get_lgu_reports(period: str | None = None, enterprise_id: str | None = None):
    """Get LGU reports with graceful fallback to runtime storage."""
    supabase_available = is_supabase_available()
    warnings: list[str] = []

    def _normalize_runtime_reports(raw_reports: list[dict], selected_period: str | None, selected_enterprise: str | None) -> list[dict]:
        normalized: list[dict] = []
        target_enterprise = enterprise_repository.resolve_enterprise_id(selected_enterprise) if selected_enterprise else None

        for report in raw_reports:
            report_period = None
            period_payload = report.get("period")
            if isinstance(period_payload, dict):
                report_period = period_payload.get("month")
            elif isinstance(period_payload, str):
                report_period = period_payload

            report_enterprise_id = str(report.get("enterprise_id") or "")

            if selected_period and report_period != selected_period:
                continue
            if target_enterprise and report_enterprise_id != target_enterprise:
                continue

            normalized.append(report)

        return normalized
    
    def _get_runtime_submitted_reports() -> list[dict]:
        """Get reports from runtime storage (submitted when Supabase was unavailable)."""
        from app.state import runtime_store
        return list(runtime_store.get_submitted_reports().values())

    reports: list[dict] = []
    
    if supabase_available:
        try:
            if enterprise_id:
                target_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
                reports = report_submission_repo.list_by_period(period, target_id) if period else report_submission_repo.list_by_enterprise(target_id)
            elif period:
                reports = report_submission_repo.list_by_period(period)
            else:
                reports = report_submission_repo.list_all()
        except Exception as exc:
            logger.warning("Falling back to runtime report packs due to Supabase report read failure: %s", exc, exc_info=True)
            reports = _normalize_runtime_reports(reporting_repository.list_report_packs(), period, enterprise_id)
            warnings.append("Supabase reports unavailable; using runtime fallback data.")
    else:
        # Supabase not available - use runtime storage + core runtime packs
        logger.info("Supabase unavailable, using runtime storage for reports")
        runtime_submitted = _get_runtime_submitted_reports()
        core_packs = reporting_repository.list_report_packs()
        combined = runtime_submitted + core_packs
        reports = _normalize_runtime_reports(combined, period, enterprise_id)
        warnings.append("Database unavailable; showing runtime data.")
        warnings.append(
            "Report submissions are temporarily unavailable from Supabase; showing runtime report fallback data."
        )

    return {
        "reports": reports,
        "warning": " ".join(dict.fromkeys(warnings)) if warnings else None,
    }


def get_lgu_report_detail(report_id: str):
    _require_supabase()

    report = None
    warning = None

    try:
        report = report_submission_repo.get_by_id(report_id)
    except Exception as exc:
        logger.warning("Failed to load report detail from Supabase for %s: %s", report_id, exc, exc_info=True)
        warning = "Supabase report detail is unavailable; returning runtime fallback data."
        report = reporting_repository.get_report_by_id(report_id)

    if not report:
        fallback_report = reporting_repository.get_report_by_id(report_id)
        if fallback_report:
            report = fallback_report
            warning = warning or "Supabase report detail is unavailable; returning runtime fallback data."

    if not report:
        raise DomainNotFoundError("Report not found")

    if warning and isinstance(report, dict):
        report = {**report, "warning": warning}

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
    current_period = datetime.now().strftime("%Y-%m")
    accounts = []
    warnings: list[str] = []

    enterprise_accounts = enterprise_repository.list_enterprise_accounts()
    enterprise_ids = [item["enterprise_id"] for item in enterprise_accounts]

    windows_by_enterprise: dict[str, dict] = {}
    current_windows_by_enterprise: dict[str, dict] = {}
    submitted_enterprises: set[str] = set()

    try:
        period_windows = reporting_window_repo.list_by_period_for_enterprises(target_period, enterprise_ids)
        windows_by_enterprise = {
            str(row.get("enterprise_id")): row
            for row in period_windows
            if isinstance(row.get("enterprise_id"), str)
        }
    except Exception as exc:
        logger.warning("Failed to batch-load reporting windows for period %s: %s", target_period, exc, exc_info=True)
        warnings.append(
            "Reporting window status is partially unavailable due to a temporary upstream database error."
        )

    missing_period_ids = [enterprise_id for enterprise_id in enterprise_ids if enterprise_id not in windows_by_enterprise]
    if missing_period_ids and target_period != current_period:
        try:
            current_windows = reporting_window_repo.list_current_by_enterprises(missing_period_ids)
            current_windows_by_enterprise = {
                str(row.get("enterprise_id")): row
                for row in current_windows
                if isinstance(row.get("enterprise_id"), str)
            }
        except Exception as exc:
            logger.warning(
                "Failed to batch-load fallback current-period reporting windows: %s",
                exc,
                exc_info=True,
            )
            warnings.append(
                "Fallback reporting window status is unavailable for some enterprises due to a temporary upstream database error."
            )

    try:
        submitted_enterprises = report_submission_repo.list_submitted_enterprise_ids_for_period(
            target_period,
            enterprise_ids,
        )
    except Exception as exc:
        logger.warning("Failed to batch-load report submission flags for period %s: %s", target_period, exc, exc_info=True)
        warnings.append(
            "Submission status is partially unavailable due to a temporary upstream database error."
        )

    for item in enterprise_accounts:
        enterprise_id = item["enterprise_id"]
        window = windows_by_enterprise.get(enterprise_id)
        if not window:
            window = current_windows_by_enterprise.get(enterprise_id)
        has_report = enterprise_id in submitted_enterprises

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
        "warning": " ".join(dict.fromkeys(warnings)) if warnings else None,
    }
