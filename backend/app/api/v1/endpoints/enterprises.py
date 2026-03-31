from fastapi import APIRouter

from app.core.supabase import get_supabase_client, is_supabase_available
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


# ============================================
# Enterprise Account Settings Endpoints
# ============================================

@router.get("/enterprise/settings")
def get_enterprise_settings(enterprise_id: str = "ent_archies_001"):
    """Get enterprise account settings."""
    if not is_supabase_available():
        return {"error": "Supabase not available", "settings": {}}
    
    client = get_supabase_client()
    result = client.table("enterprises").select("*").eq("id", enterprise_id).execute()
    
    if not result.data or len(result.data) == 0:
        return {"error": "Enterprise not found", "settings": {}}
    
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
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
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
    
    result = client.table("enterprises").update(update_data).eq("id", enterprise_id).execute()
    
    if result.data and len(result.data) > 0:
        return {"message": "Settings updated", "settings": result.data[0]}
    
    return {"error": "Failed to update settings"}


@router.get("/enterprise/profile/extended")
def get_enterprise_profile_extended(enterprise_id: str = "ent_archies_001"):
    """Get extended enterprise profile from enterprise_profiles table."""
    if not is_supabase_available():
        return {"error": "Supabase not available", "profile": {}}
    
    client = get_supabase_client()
    result = client.table("enterprise_profiles").select("*").eq("id", enterprise_id).execute()
    
    if not result.data or len(result.data) == 0:
        return {"enterprise_id": enterprise_id, "profile": {}}
    
    return {"enterprise_id": enterprise_id, "profile": result.data[0]}


@router.put("/enterprise/profile/extended")
def update_enterprise_profile_extended(
    body: EnterpriseProfileUpdate,
    enterprise_id: str = "ent_archies_001",
):
    """Update extended enterprise profile."""
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
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
    
    result = client.table("enterprise_profiles").upsert({
        "id": enterprise_id,
        **update_data
    }).execute()
    
    if result.data and len(result.data) > 0:
        return {"message": "Profile updated", "profile": result.data[0]}
    
    return {"error": "Failed to update profile"}


@router.post("/enterprise/password/change")
def change_enterprise_password(
    body: EnterprisePasswordChange,
    enterprise_id: str = "ent_archies_001",
):
    """Change enterprise account password (placeholder - requires auth integration)."""
    # Note: This is a placeholder. In production, this would integrate with
    # Supabase Auth or another authentication system.
    return {
        "message": "Password change request received",
        "enterprise_id": enterprise_id,
        "note": "Password management requires auth system integration"
    }


@router.get("/enterprise/preferences")
def get_enterprise_preferences(enterprise_id: str = "ent_archies_001"):
    """Get enterprise preferences from profile settings."""
    if not is_supabase_available():
        return {"error": "Supabase not available", "preferences": {}}
    
    client = get_supabase_client()
    result = client.table("enterprise_profiles").select("settings").eq("id", enterprise_id).execute()
    
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
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
    client = get_supabase_client()
    
    result = client.table("enterprise_profiles").upsert({
        "id": enterprise_id,
        "settings": body.preferences
    }).execute()
    
    if result.data and len(result.data) > 0:
        return {"message": "Preferences updated", "preferences": body.preferences}
    
    return {"error": "Failed to update preferences"}


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
