from app.repositories.mock_repository import get_core_module


core = get_core_module()


def get_enterprise_profile(enterprise_id: str):
    return core.get_enterprise_profile_endpoint(enterprise_id)


def get_enterprise_accounts():
    return core.get_enterprise_accounts()


def get_enterprise_dashboard(date: str | None = None, enterprise_id: str = "ent_archies_001"):
    return core.get_enterprise_dashboard(date, enterprise_id)


def get_reporting_window_status(enterprise_id: str = "ent_archies_001"):
    return core.get_reporting_window_status(enterprise_id)
