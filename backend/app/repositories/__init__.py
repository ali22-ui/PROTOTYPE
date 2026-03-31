"""Repository layer package."""

from app.repositories.analytics_repository import (
    get_detection_stats,
    get_unified_detections,
)
from app.repositories.enterprise_repository import (
    get_enterprise_account,
    get_enterprise_profile,
    get_reporting_window,
    list_enterprise_accounts,
    list_enterprises,
    resolve_enterprise_id,
)
from app.repositories.geo_repository import (
    get_barangay_by_id,
    list_barangays,
)
from app.repositories.reporting_repository import (
    add_report_pack,
    build_report_pack,
    compute_report_statistics,
    get_report_by_id,
    list_action_logs,
    list_authority_packages,
    list_report_packs,
)
from app.repositories.supabase_repositories import (
    AuditLogRepository,
    AuthorityPackageRepository,
    ComplianceActionRepository,
    EnterpriseActionRepository,
    EnterpriseInfractionRepository,
    LguSettingsRepository,
    ReportingWindowRepository,
    ReportSubmissionRepository,
    SupabaseRepository,
    audit_log_repo,
    authority_package_repo,
    compliance_action_repo,
    enterprise_action_repo,
    enterprise_infraction_repo,
    lgu_settings_repo,
    report_submission_repo,
    reporting_window_repo,
)

__all__ = [
    # Analytics
    "get_detection_stats",
    "get_unified_detections",
    # Enterprise
    "get_enterprise_account",
    "get_enterprise_profile",
    "get_reporting_window",
    "list_enterprise_accounts",
    "list_enterprises",
    "resolve_enterprise_id",
    # Geo
    "get_barangay_by_id",
    "list_barangays",
    # Reporting (legacy)
    "add_report_pack",
    "build_report_pack",
    "compute_report_statistics",
    "get_report_by_id",
    "list_action_logs",
    "list_authority_packages",
    "list_report_packs",
    # Supabase repositories
    "SupabaseRepository",
    "ReportingWindowRepository",
    "ReportSubmissionRepository",
    "AuthorityPackageRepository",
    "EnterpriseActionRepository",
    "LguSettingsRepository",
    "EnterpriseInfractionRepository",
    "ComplianceActionRepository",
    "AuditLogRepository",
    # Repository instances
    "reporting_window_repo",
    "report_submission_repo",
    "authority_package_repo",
    "enterprise_action_repo",
    "lgu_settings_repo",
    "enterprise_infraction_repo",
    "compliance_action_repo",
    "audit_log_repo",
]
