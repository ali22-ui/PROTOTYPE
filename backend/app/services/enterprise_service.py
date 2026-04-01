import logging

from domain_exceptions import DomainNotFoundError, DomainServiceUnavailableError

from app.core.supabase import is_supabase_available
from app.repositories import enterprise_repository
from app.repositories.supabase_repositories import reporting_window_repo, system_settings_repo

logger = logging.getLogger(__name__)


def _require_supabase() -> None:
    if not is_supabase_available():
        raise DomainServiceUnavailableError("Supabase is required for enterprise reporting workflows")


def _get_reporting_window_safe(enterprise_id: str, *, fail_on_service_error: bool = False):
    """
    Get reporting window with graceful fallback.
    Returns None if window not found or if there's a permission error.
    """
    try:
        window = reporting_window_repo.get_by_enterprise_current(enterprise_id)
        if not window:
            window = reporting_window_repo.get_by_enterprise(enterprise_id)
        return window
    except DomainServiceUnavailableError as e:
        logger.warning(f"Could not fetch reporting window for {enterprise_id}: {e}")
        if fail_on_service_error:
            raise
        return enterprise_repository.get_reporting_window(enterprise_id)
    except Exception as e:
        logger.exception(f"Unexpected error fetching reporting window for {enterprise_id}")
        if fail_on_service_error:
            raise DomainServiceUnavailableError("Failed to fetch reporting window") from e
        return enterprise_repository.get_reporting_window(enterprise_id)


def get_enterprise_profile(enterprise_id: str):
    profile = enterprise_repository.get_enterprise_profile(enterprise_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")

    window = _get_reporting_window_safe(enterprise_id)
    global_state = system_settings_repo.get_reporting_window_state()
    is_global_open = bool(global_state.get("is_reporting_window_open", False))

    status = window.get("status") if window else None
    if not isinstance(status, str) or not status.strip() or status != "SUBMITTED":
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

    window = _get_reporting_window_safe(enterprise_id, fail_on_service_error=True)

    if not window:
        raise DomainNotFoundError("Reporting window not found")

    global_state = system_settings_repo.get_reporting_window_state()
    is_global_open = bool(global_state.get("is_reporting_window_open", False))

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
