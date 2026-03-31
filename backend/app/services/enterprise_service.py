from datetime import datetime

from domain_exceptions import DomainNotFoundError, DomainServiceUnavailableError

from app.core.supabase import is_supabase_available
from app.repositories import enterprise_repository
from app.repositories.supabase_repositories import reporting_window_repo, system_settings_repo


def _require_supabase() -> None:
    if not is_supabase_available():
        raise DomainServiceUnavailableError("Supabase is required for enterprise reporting workflows")


def get_enterprise_profile(enterprise_id: str):
    _require_supabase()

    profile = enterprise_repository.get_enterprise_profile(enterprise_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")

    window = None
    try:
        window = reporting_window_repo.get_by_enterprise_current(enterprise_id)
        if not window:
            window = reporting_window_repo.get_by_enterprise(enterprise_id)
    except Exception:
        window = None

    global_state = system_settings_repo.get_reporting_window_state()
    is_global_open = bool(global_state.get("is_reporting_window_open", False))

    status = window.get("status") if window else None
    if not isinstance(status, str) or not status.strip():
        status = "OPEN" if is_global_open else "CLOSED"

    if status != "SUBMITTED":
        status = "OPEN" if is_global_open else "CLOSED"

    return {
        **profile,
        "reporting_window_status": status,
    }


def get_enterprise_accounts():
    accounts = []
    for item in enterprise_repository.list_enterprise_accounts():
        profile = enterprise_repository.get_enterprise_profile(item["enterprise_id"])
        if not profile:
            raise DomainNotFoundError("Enterprise profile not found")

        accounts.append(
            {
                "enterprise_id": item["enterprise_id"],
                "company_name": item["company_name"],
                "dashboard_title": profile["dashboard_title"],
                "linked_lgu_id": item["linked_lgu_id"],
                "logo_url": profile["logo_url"],
                "theme": profile["theme"],
            }
        )

    return {"accounts": accounts}


def get_enterprise_dashboard(date: str | None = None, enterprise_id: str = "ent_archies_001"):
    account = enterprise_repository.get_enterprise_account(enterprise_id)
    if not account:
        raise DomainNotFoundError("Enterprise account not found")

    return enterprise_repository.get_dashboard_payload(date, enterprise_id)


def get_reporting_window_status(enterprise_id: str = "ent_archies_001"):
    _require_supabase()

    current_period = datetime.now().strftime("%Y-%m")
    window = None
    try:
        window = reporting_window_repo.get_by_enterprise(enterprise_id, current_period)
        if not window:
            window = reporting_window_repo.get_by_enterprise(enterprise_id)
    except Exception:
        window = None

    global_state = system_settings_repo.get_reporting_window_state()
    is_global_open = bool(global_state.get("is_reporting_window_open", False))

    if not window:
        status = "OPEN" if is_global_open else "CLOSED"
        return {
            "enterprise_id": enterprise_id,
            "period": current_period,
            "status": status,
            "is_reporting_window_open": is_global_open,
            "updated_at": global_state.get("updated_at"),
            "updated_by": global_state.get("updated_by"),
            "message": "Reporting window is open." if is_global_open else "Reporting window is currently closed.",
        }

    status = window.get("status", "CLOSED")
    if status != "SUBMITTED":
        status = "OPEN" if is_global_open else "CLOSED"

    return {
        **window,
        "status": status,
        "is_reporting_window_open": is_global_open,
        "updated_at": global_state.get("updated_at"),
        "updated_by": global_state.get("updated_by"),
        "message": "Reporting window is open." if status == "OPEN" else "Reporting window is currently closed.",
    }
