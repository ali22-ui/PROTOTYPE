from app.repositories.mock_repository import get_core_module


core = get_core_module()


def health_check():
    return core.health_check()


def get_overview():
    return core.get_overview()


def get_reports():
    return core.get_reports()


def get_logs():
    return core.get_logs()


def get_enterprises():
    return core.get_enterprises()


def get_enterprise_analytics(enterprise_id: int):
    return core.get_enterprise_analytics(enterprise_id)


def get_enterprise_recommendations(enterprise_id: str = "ent_archies_001"):
    return core.get_enterprise_recommendations(enterprise_id)
