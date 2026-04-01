import logging
from datetime import datetime

from fastapi import APIRouter, Body
from postgrest.exceptions import APIError

from domain_exceptions import DomainNotFoundError, DomainServiceUnavailableError

from app.core.supabase import get_supabase_client, is_supabase_available
from app.repositories import enterprise_repository
from app.repositories.supabase_repositories import reporting_window_repo, system_settings_repo
from app.schemas.enterprise import (
    EnterpriseAccountSettings,
    EnterpriseActionRequest,
    EnterprisePasswordChange,
    EnterprisePreferencesUpdate,
    EnterpriseProfileUpdate,
    EnterpriseReportSubmission,
)
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
logger = logging.getLogger(__name__)
OPEN_REPORTING_STATUSES = {"OPEN", "REMIND", "WARN", "RENOTIFY"}


def _is_supabase_access_error(exc: Exception) -> bool:
    if isinstance(exc, APIError):
        payload = exc.args[0] if exc.args else None
        if isinstance(payload, dict):
            code = str(payload.get("code") or "").upper()
            if code in {"42501", "42P01", "PGRST205"}:
                return True

    lowered = str(exc).lower()
    return (
        "permission denied" in lowered
        or "42501" in lowered
        or "42p01" in lowered
        or "does not exist" in lowered
        or "could not find the table" in lowered
        or "schema cache" in lowered
    )


def _require_supabase():
    if not is_supabase_available():
        raise DomainServiceUnavailableError("Supabase is required for enterprise account workflows")


def _build_reporting_status_compat_payload(
    enterprise_id: str,
    month: str | None,
) -> dict[str, object]:
    target_month = (month or datetime.now().strftime("%Y-%m")).strip()

    window: dict[str, object] | None = None
    try:
        window = reporting_window_repo.get_by_enterprise(enterprise_id, target_month)
        if not window:
            window = reporting_window_repo.get_by_enterprise_current(enterprise_id)
    except DomainServiceUnavailableError:
        logger.warning("Reporting window access denied; using runtime fallback for status compatibility")
        window = enterprise_repository.get_reporting_window(enterprise_id)
    except Exception as exc:
        if not _is_supabase_access_error(exc):
            raise
        logger.warning("Reporting window query failed; using runtime fallback for status compatibility")
        window = enterprise_repository.get_reporting_window(enterprise_id)

    global_open = False
    try:
        global_state = system_settings_repo.get_reporting_window_state()
        global_open = bool(global_state.get("is_reporting_window_open", False))
    except Exception:
        global_open = False

    raw_status = str((window or {}).get("status") or "").upper()
    status = raw_status if raw_status else ("OPEN" if global_open else "CLOSED")
    is_open = status in OPEN_REPORTING_STATUSES or (status == "CLOSED" and global_open)

    requested_at = (window or {}).get("opened_at") or (window or {}).get("updated_at")
    message = "Reporting window is open." if is_open else "Reporting window is currently closed."

    return {
        "enterprise_id": enterprise_id,
        "period": target_month,
        "status": status,
        "hasLguRequestedReports": is_open,
        "has_lgu_requested_reports": is_open,
        "requestedAt": requested_at,
        "requested_at": requested_at,
        "message": message,
    }


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


@router.get("/enterprise/reports/lgu-notification-status")
def get_enterprise_lgu_notification_status(
    enterprise_id: str = "ent_archies_001",
    month: str | None = None,
):
    return _build_reporting_status_compat_payload(enterprise_id, month)


@router.get("/enterprise/lgu/notification-status")
def get_enterprise_lgu_notification_status_alias(
    enterprise_id: str = "ent_archies_001",
    month: str | None = None,
):
    return _build_reporting_status_compat_payload(enterprise_id, month)


@router.get("/enterprise/reports/request-status")
def get_enterprise_report_request_status(
    enterprise_id: str = "ent_archies_001",
    month: str | None = None,
):
    return _build_reporting_status_compat_payload(enterprise_id, month)


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


# ============================================
# Enterprise Account Settings Endpoints
# ============================================

@router.get("/enterprise/settings")
def get_enterprise_settings(enterprise_id: str = "ent_archies_001"):
    """Get enterprise account settings."""
    _require_supabase()

    client = get_supabase_client()
    try:
        result = client.table("enterprises").select("*").eq("id", enterprise_id).execute()
    except Exception as exc:
        if not _is_supabase_access_error(exc):
            raise

        fallback_account = enterprise_repository.get_enterprise_account(enterprise_id)
        fallback_profile = enterprise_repository.get_enterprise_profile(enterprise_id) or {}
        company_name = ""
        if fallback_account and isinstance(fallback_account.get("company_name"), str):
            company_name = str(fallback_account.get("company_name"))
        elif isinstance(fallback_profile.get("company_name"), str):
            company_name = str(fallback_profile.get("company_name"))

        logger.warning("Supabase access denied for enterprises table; returning account settings fallback")
        return {
            "enterprise_id": enterprise_id,
            "settings": {
                "company_name": company_name,
                "business_type": "",
                "address": "",
                "contact_email": "",
                "contact_phone": "",
                "barangay": "",
            },
        }

    if not result.data or len(result.data) == 0:
        raise DomainNotFoundError("Enterprise not found")

    enterprise = result.data[0]
    return {
        "enterprise_id": enterprise_id,
        "settings": {
            "company_name": enterprise.get("company_name"),
            "business_type": enterprise.get("business_type"),
            "address": enterprise.get("address"),
            "contact_email": enterprise.get("contact_email"),
            "contact_phone": enterprise.get("contact_phone"),
            "barangay": enterprise.get("barangay"),
        }
    }


@router.put("/enterprise/settings")
def update_enterprise_settings(
    body: EnterpriseAccountSettings,
    enterprise_id: str = "ent_archies_001",
):
    """Update enterprise account settings."""
    _require_supabase()

    client = get_supabase_client()

    # Build update data, excluding None values
    update_data = {}
    if body.company_name is not None:
        update_data["company_name"] = body.company_name
    if body.business_type is not None:
        update_data["business_type"] = body.business_type
    if body.address is not None:
        update_data["address"] = body.address
    if body.contact_email is not None:
        update_data["contact_email"] = body.contact_email
    if body.contact_phone is not None:
        update_data["contact_phone"] = body.contact_phone
    
    if not update_data:
        return {"message": "No changes provided"}

    try:
        result = client.table("enterprises").update(update_data).eq("id", enterprise_id).execute()
    except Exception as exc:
        if _is_supabase_access_error(exc):
            raise DomainServiceUnavailableError("Database access denied for enterprise settings.")
        raise

    if result.data and len(result.data) > 0:
        return {"message": "Settings updated", "settings": result.data[0]}

    raise DomainNotFoundError("Enterprise not found")


@router.get("/enterprise/profile/extended")
def get_enterprise_profile_extended(enterprise_id: str = "ent_archies_001"):
    """Get extended enterprise profile from enterprise_profiles table."""
    _require_supabase()

    client = get_supabase_client()
    try:
        result = client.table("enterprise_profiles").select("*").eq("id", enterprise_id).execute()
    except Exception as exc:
        if not _is_supabase_access_error(exc):
            raise
        logger.warning("Supabase access denied for enterprise_profiles; returning empty extended profile")
        return {"enterprise_id": enterprise_id, "profile": {}}

    if not result.data or len(result.data) == 0:
        return {"enterprise_id": enterprise_id, "profile": {}}

    return {"enterprise_id": enterprise_id, "profile": result.data[0]}


@router.put("/enterprise/profile/extended")
def update_enterprise_profile_extended(
    body: EnterpriseProfileUpdate,
    enterprise_id: str = "ent_archies_001",
):
    """Update extended enterprise profile."""
    _require_supabase()

    client = get_supabase_client()

    update_data = {}
    if body.business_permit_number is not None:
        update_data["business_permit_number"] = body.business_permit_number
    if body.owner_name is not None:
        update_data["owner_name"] = body.owner_name
    if body.owner_contact is not None:
        update_data["owner_contact"] = body.owner_contact
    if body.description is not None:
        update_data["description"] = body.description
    if body.logo_url is not None:
        update_data["logo_url"] = body.logo_url
    if body.settings is not None:
        update_data["settings"] = body.settings
    
    if not update_data:
        return {"message": "No changes provided"}

    try:
        result = client.table("enterprise_profiles").upsert({
            "id": enterprise_id,
            **update_data
        }).execute()
    except Exception as exc:
        if _is_supabase_access_error(exc):
            raise DomainServiceUnavailableError("Database access denied for enterprise profile.")
        raise

    if result.data and len(result.data) > 0:
        return {"message": "Profile updated", "profile": result.data[0]}

    raise DomainNotFoundError("Enterprise profile could not be updated")


@router.post("/enterprise/password/change")
def change_enterprise_password(
    body: EnterprisePasswordChange,
    enterprise_id: str = "ent_archies_001",
):
    """Change enterprise account password (placeholder - requires auth integration)."""
    # Note: This is a placeholder. In production, this would integrate with
    # Supabase Auth or another authentication system.
    _ = body
    return {
        "message": "Password change request received",
        "enterprise_id": enterprise_id,
        "note": "Password management requires auth system integration"
    }


@router.get("/enterprise/preferences")
def get_enterprise_preferences(enterprise_id: str = "ent_archies_001"):
    """Get enterprise preferences from profile settings."""
    _require_supabase()

    client = get_supabase_client()
    try:
        result = client.table("enterprise_profiles").select("settings").eq("id", enterprise_id).execute()
    except Exception as exc:
        if not _is_supabase_access_error(exc):
            raise
        logger.warning("Supabase access denied for enterprise preferences; returning empty preferences")
        return {"enterprise_id": enterprise_id, "preferences": {}}

    if not result.data or len(result.data) == 0:
        return {"enterprise_id": enterprise_id, "preferences": {}}

    return {
        "enterprise_id": enterprise_id,
        "preferences": result.data[0].get("settings", {})
    }


@router.put("/enterprise/preferences")
def update_enterprise_preferences(
    body: EnterprisePreferencesUpdate,
    enterprise_id: str = "ent_archies_001",
):
    """Update enterprise preferences."""
    _require_supabase()

    client = get_supabase_client()

    try:
        result = client.table("enterprise_profiles").upsert({
            "id": enterprise_id,
            "settings": body.preferences
        }).execute()
    except Exception as exc:
        if _is_supabase_access_error(exc):
            raise DomainServiceUnavailableError("Database access denied for enterprise preferences.")
        raise

    if result.data and len(result.data) > 0:
        return {"message": "Preferences updated", "preferences": body.preferences}

    raise DomainNotFoundError("Enterprise preferences could not be updated")


@router.get("/enterprise/account/settings")
def get_enterprise_account_settings_compat(enterprise_id: str = "ent_archies_001"):
    settings_payload = get_enterprise_settings(enterprise_id)
    profile_payload = get_enterprise_profile_extended(enterprise_id)
    preferences_payload = get_enterprise_preferences(enterprise_id)

    profile = profile_payload.get("profile", {})
    settings = settings_payload.get("settings", {})

    return {
        "profile": {
            "businessPermit": profile.get("business_permit_number", ""),
            "contactEmail": settings.get("contact_email", ""),
            "businessPhone": settings.get("contact_phone", ""),
            "representativeName": profile.get("owner_name", ""),
        },
        "preferences": {
            "emailNotifications": bool(preferences_payload.get("preferences", {}).get("emailNotifications", True)),
            "themePreference": preferences_payload.get("preferences", {}).get("themePreference", "system"),
        },
    }


@router.post("/enterprise/account/settings/profile")
def save_enterprise_account_profile_compat(
    enterprise_id: str = "ent_archies_001",
    profile: dict = Body(default={}),
):
    payload = profile
    update_enterprise_settings(
        EnterpriseAccountSettings(
            contact_email=payload.get("contactEmail"),
            contact_phone=payload.get("businessPhone"),
        ),
        enterprise_id=enterprise_id,
    )
    update_enterprise_profile_extended(
        EnterpriseProfileUpdate(
            business_permit_number=payload.get("businessPermit"),
            owner_name=payload.get("representativeName"),
        ),
        enterprise_id=enterprise_id,
    )
    return {"success": True, "message": "Profile settings saved successfully."}


@router.post("/enterprise/account/settings/password")
def change_enterprise_password_compat(
    enterprise_id: str = "ent_archies_001",
    current_password: str | None = Body(default=None),
    new_password: str | None = Body(default=None),
):
    _ = current_password
    _ = new_password
    return {
        "success": True,
        "message": "Password change request received",
        "enterprise_id": enterprise_id,
    }


@router.post("/enterprise/account/settings/preferences")
def save_enterprise_preferences_compat(
    enterprise_id: str = "ent_archies_001",
    preferences: dict = Body(default={}),
):
    update_enterprise_preferences(
        EnterprisePreferencesUpdate(preferences=preferences),
        enterprise_id=enterprise_id,
    )
    return {"success": True, "message": "System preferences saved successfully."}


@router.post("/enterprise/notify-submit")
def notify_enterprise_submit(enterprise_id: str = "ent_archies_001", period: str | None = None):
    """Notify enterprise about pending report submission."""
    from datetime import datetime
    
    target_period = period or datetime.now().strftime("%Y-%m")
    
    return {
        "message": "Notification sent",
        "enterprise_id": enterprise_id,
        "period": target_period,
        "notification_type": "report_submission_reminder",
        "note": "Email/push notification integration pending"
    }
