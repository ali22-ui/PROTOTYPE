from fastapi import APIRouter

from app.core.supabase import is_supabase_available
from app.repositories.supabase_repositories import (
    compliance_action_repo,
    enterprise_infraction_repo,
    lgu_settings_repo,
)
from app.schemas.lgu import (
    EnterpriseComplianceAction,
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
        return {"settings": {}, "message": "Supabase not available"}
    
    settings = lgu_settings_repo.list_by_lgu(LGU_ID)
    return {"lgu_id": LGU_ID, "settings": settings}


@router.get("/lgu/settings/{setting_key}")
def get_lgu_setting(setting_key: str):
    """Get a specific LGU setting."""
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
    value = lgu_settings_repo.get_value(LGU_ID, setting_key)
    return {"lgu_id": LGU_ID, "key": setting_key, "value": value}


@router.put("/lgu/settings")
def update_lgu_setting(body: LguSettingsUpdate):
    """Update an LGU setting."""
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
    result = lgu_settings_repo.upsert(LGU_ID, body.setting_key, body.setting_value)
    return {"message": "Setting updated", "setting": result}


# ============================================
# Compliance Actions Endpoints
# ============================================

@router.post("/lgu/compliance-actions")
def create_compliance_action(body: EnterpriseComplianceAction):
    """Create a compliance action for an enterprise."""
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
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
    if not is_supabase_available():
        return {"actions": [], "message": "Supabase not available"}
    
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
    if not is_supabase_available():
        return {"infractions": {}, "message": "Supabase not available"}
    
    infractions = enterprise_infraction_repo.list_by_lgu(LGU_ID)
    return {"lgu_id": LGU_ID, "infractions": infractions}


@router.get("/lgu/infractions/{enterprise_id}")
def list_enterprise_infractions(enterprise_id: str):
    """List infractions for a specific enterprise."""
    if not is_supabase_available():
        return {"infractions": [], "message": "Supabase not available"}
    
    infractions = enterprise_infraction_repo.list_by_enterprise(enterprise_id)
    return {"enterprise_id": enterprise_id, "infractions": infractions}


@router.post("/lgu/infractions")
def create_infraction(body: EnterpriseInfractionCreate):
    """Create an infraction for an enterprise."""
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
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
    if not is_supabase_available():
        return {"error": "Supabase not available"}
    
    infraction = enterprise_infraction_repo.resolve(infraction_id, "lgu_admin_01")
    if not infraction:
        return {"error": "Infraction not found"}
    
    return {"message": "Infraction resolved", "infraction": infraction}
