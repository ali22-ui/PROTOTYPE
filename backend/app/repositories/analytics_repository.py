from app.domain import core_runtime as core


def get_overview_payload() -> dict:
    return core.OVERVIEW


def get_reports_payload() -> dict:
    return core.REPORTS


def get_logs_payload() -> list[dict]:
    return core.LOGS


def get_enterprise_analytics(enterprise_id: int) -> dict | None:
    return core.ENTERPRISE_ANALYTICS.get(enterprise_id)


def build_default_analytics(enterprise_id: int) -> dict:
    return core.build_default_analytics(enterprise_id)
