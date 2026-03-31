from fastapi import APIRouter

from domain_exceptions import DomainConflictError, DomainNotFoundError, DomainServiceUnavailableError

from app.core.supabase import get_supabase_client, is_supabase_available
from app.repositories.supabase_repositories import (
    compliance_action_repo,
    enterprise_infraction_repo,
    lgu_settings_repo,
    system_settings_repo,
)
from app.schemas.lgu import (
    EnterpriseComplianceAction,
    LguEnterpriseAccountCreate,
    LguEnterpriseAccountUpdate,
    EnterpriseInfractionCreate,
    LguSettingsUpdate,
    ReportingWindowAction,
    ReportingWindowBulkAction,
)
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

LGU_ID = "lgu_san_pedro_001"
REPORTING_WINDOW_SETTING_KEY = "is_reporting_window_open"


def _require_supabase() -> None:
    if not is_supabase_available():
        raise DomainServiceUnavailableError("Supabase is required for LGU workflows")


def _coerce_boolean_setting(value: object) -> bool | None:
    if isinstance(value, bool):
        return value

    if isinstance(value, (int, float)):
        return bool(value)

    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"1", "true", "yes", "on", "open"}:
            return True
        if normalized in {"0", "false", "no", "off", "close", "closed"}:
            return False

    return None


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


# ============================================
# LGU Settings Endpoints
# ============================================

@router.get("/lgu/settings")
def get_lgu_settings():
    """Get all LGU settings."""
    if not is_supabase_available():
        system_state = system_settings_repo.get_reporting_window_state()
        return {
            "lgu_id": LGU_ID,
            "settings": {
                REPORTING_WINDOW_SETTING_KEY: bool(system_state.get("is_reporting_window_open", False)),
            },
        }

    _require_supabase()

    settings = lgu_settings_repo.list_by_lgu(LGU_ID)
    system_state = system_settings_repo.get_reporting_window_state()
    settings[REPORTING_WINDOW_SETTING_KEY] = bool(system_state.get("is_reporting_window_open", False))
    return {"lgu_id": LGU_ID, "settings": settings}


@router.get("/lgu/settings/{setting_key}")
def get_lgu_setting(setting_key: str):
    """Get a specific LGU setting."""
    if setting_key == REPORTING_WINDOW_SETTING_KEY:
        state = system_settings_repo.get_reporting_window_state()
        return {
            "lgu_id": LGU_ID,
            "key": setting_key,
            "value": bool(state.get("is_reporting_window_open", False)),
            "setting": state,
        }

    _require_supabase()

    value = lgu_settings_repo.get_value(LGU_ID, setting_key)
    return {"lgu_id": LGU_ID, "key": setting_key, "value": value}


@router.put("/lgu/settings")
def update_lgu_setting(body: LguSettingsUpdate):
    """Update an LGU setting."""
    if body.setting_key == REPORTING_WINDOW_SETTING_KEY:
        normalized = _coerce_boolean_setting(body.setting_value)
        if normalized is None:
            raise DomainConflictError("is_reporting_window_open must be a boolean value")

        setting = system_settings_repo.set_reporting_window_open(
            is_open=normalized,
            updated_by="lgu_admin_01",
        )

        return {
            "message": "Reporting window setting updated",
            "setting": {
                "setting_key": REPORTING_WINDOW_SETTING_KEY,
                "setting_value": bool(setting.get("is_reporting_window_open", False)),
                "updated_at": setting.get("updated_at"),
                "updated_by": setting.get("updated_by"),
            },
        }

    _require_supabase()

    result = lgu_settings_repo.upsert(LGU_ID, body.setting_key, body.setting_value)
    return {"message": "Setting updated", "setting": result}


@router.post("/lgu/enterprise-accounts")
def create_lgu_enterprise_account(body: LguEnterpriseAccountCreate):
    _require_supabase()

    client = get_supabase_client()
    if not client:
        raise DomainServiceUnavailableError("Supabase client is unavailable")

    enterprise_payload = {
        "id": body.enterprise_id,
        "company_name": body.company_name,
        "linked_lgu_id": body.linked_lgu_id,
        "barangay": body.barangay,
        "contact_email": body.contact_email,
    }
    profile_payload = {
        "id": body.enterprise_id,
        "linked_lgu_id": body.linked_lgu_id,
        "owner_name": body.username,
    }

    client.table("enterprises").upsert(enterprise_payload).execute()
    profile_result = client.table("enterprise_profiles").upsert(profile_payload).execute()

    created_profile = profile_result.data[0] if profile_result.data else profile_payload
    return {
        "success": True,
        "message": "Enterprise account created successfully.",
        "enterprise": {
            "enterprise_id": body.enterprise_id,
            "company_name": body.company_name,
            "linked_lgu_id": body.linked_lgu_id,
            "barangay": body.barangay,
            "contact_email": body.contact_email,
            "profile": created_profile,
        },
    }


@router.put("/lgu/enterprise-accounts/{enterprise_id}")
def update_lgu_enterprise_account(enterprise_id: str, body: LguEnterpriseAccountUpdate):
    _require_supabase()

    client = get_supabase_client()
    if not client:
        raise DomainServiceUnavailableError("Supabase client is unavailable")

    ent_updates: dict = {}
    profile_updates: dict = {"id": enterprise_id}

    if body.company_name is not None:
        ent_updates["company_name"] = body.company_name
    if body.linked_lgu_id is not None:
        ent_updates["linked_lgu_id"] = body.linked_lgu_id
        profile_updates["linked_lgu_id"] = body.linked_lgu_id
    if body.barangay is not None:
        ent_updates["barangay"] = body.barangay
    if body.contact_email is not None:
        ent_updates["contact_email"] = body.contact_email
    if body.username is not None:
        profile_updates["owner_name"] = body.username

    existing = client.table("enterprises").select("id").eq("id", enterprise_id).execute()
    if not existing.data:
        raise DomainNotFoundError("Enterprise account not found")

    if ent_updates:
        client.table("enterprises").update(ent_updates).eq("id", enterprise_id).execute()

    if len(profile_updates) > 1:
        client.table("enterprise_profiles").upsert(profile_updates).execute()

    return {
        "success": True,
        "message": "Enterprise account updated successfully.",
        "enterprise_id": enterprise_id,
    }


@router.delete("/lgu/enterprise-accounts/{enterprise_id}")
def delete_lgu_enterprise_account(enterprise_id: str):
    _require_supabase()

    client = get_supabase_client()
    if not client:
        raise DomainServiceUnavailableError("Supabase client is unavailable")

    existing = client.table("enterprises").select("id").eq("id", enterprise_id).execute()
    if not existing.data:
        raise DomainNotFoundError("Enterprise account not found")

    client.table("enterprise_profiles").delete().eq("id", enterprise_id).execute()
    client.table("enterprises").delete().eq("id", enterprise_id).execute()

    return {"success": True, "message": "Enterprise account deleted successfully."}


# ============================================
# Compliance Actions Endpoints
# ============================================

@router.post("/lgu/compliance-actions")
def create_compliance_action(body: EnterpriseComplianceAction):
    """Create a compliance action for an enterprise."""
    _require_supabase()

    action = compliance_action_repo.create(
        enterprise_id=body.enterprise_id,
        lgu_id=LGU_ID,
        period=body.period,
        action_type=body.action_type,
        triggered_by="lgu_admin_01",
        message=body.message,
    )
    return {"message": f"Compliance action '{body.action_type}' created", "action": action}


@router.get("/lgu/compliance-actions")
def list_compliance_actions(period: str | None = None, enterprise_id: str | None = None):
    """List compliance actions."""
    _require_supabase()

    if enterprise_id:
        actions = compliance_action_repo.list_by_enterprise(enterprise_id, period)
    elif period:
        actions = compliance_action_repo.list_by_lgu_period(LGU_ID, period)
    else:
        actions = []
    
    return {"actions": actions}


# ============================================
# Infractions Endpoints
# ============================================

@router.get("/lgu/infractions")
def list_all_infractions():
    """List all infractions for this LGU."""
    _require_supabase()

    infractions = enterprise_infraction_repo.list_by_lgu(LGU_ID)
    return {"lgu_id": LGU_ID, "infractions": infractions}


@router.get("/lgu/infractions/{enterprise_id}")
def list_enterprise_infractions(enterprise_id: str):
    """List infractions for a specific enterprise."""
    _require_supabase()

    infractions = enterprise_infraction_repo.list_by_enterprise(enterprise_id)
    return {"enterprise_id": enterprise_id, "infractions": infractions}


@router.post("/lgu/infractions")
def create_infraction(body: EnterpriseInfractionCreate):
    """Create an infraction for an enterprise."""
    _require_supabase()

    infraction = enterprise_infraction_repo.create(
        enterprise_id=body.enterprise_id,
        lgu_id=LGU_ID,
        period=body.period,
        infraction_type=body.infraction_type,
        severity=body.severity,
        source=body.source,
        note=body.note,
    )
    return {"message": "Infraction recorded", "infraction": infraction}


@router.post("/lgu/infractions/{infraction_id}/resolve")
def resolve_infraction(infraction_id: str):
    """Resolve an infraction."""
    _require_supabase()

    infraction = enterprise_infraction_repo.resolve(infraction_id, "lgu_admin_01")
    if not infraction:
        raise DomainNotFoundError("Infraction not found")
    
    return {"message": "Infraction resolved", "infraction": infraction}
