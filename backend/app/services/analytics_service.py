from domain_exceptions import DomainNotFoundError

from app.repositories import analytics_repository, enterprise_repository


def health_check():
    return {"status": "ok"}


def get_overview():
    return analytics_repository.get_overview_payload()


def get_reports():
    return analytics_repository.get_reports_payload()


def get_logs():
    return {"logs": analytics_repository.get_logs_payload()}


def get_enterprises():
    return {"enterprises": enterprise_repository.list_enterprises()}


def get_enterprise_analytics(enterprise_id: int):
    enterprise = next((item for item in enterprise_repository.list_enterprises() if item["id"] == enterprise_id), None)
    if not enterprise:
        raise DomainNotFoundError("Enterprise not found")

    analytics = analytics_repository.get_enterprise_analytics(enterprise_id)
    if analytics is None:
        analytics = analytics_repository.build_default_analytics(enterprise_id)

    return {
        "enterprise": enterprise,
        "analytics": analytics,
    }


def get_enterprise_recommendations(enterprise_id: str = "ent_archies_001"):
    enterprise = enterprise_repository.get_enterprise_account(enterprise_id)
    if not enterprise:
        raise DomainNotFoundError("Enterprise account not found")

    resolved_id = enterprise_repository.resolve_enterprise_id(enterprise_id)
    return {
        "enterprise_id": resolved_id,
        "recommendations": enterprise_repository.list_recommendations(),
    }
