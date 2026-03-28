from domain_exceptions import DomainNotFoundError

from app.repositories import enterprise_repository


def get_enterprise_profile(enterprise_id: str):
    profile = enterprise_repository.get_enterprise_profile(enterprise_id)
    if not profile:
        raise DomainNotFoundError("Enterprise profile not found")

    window = enterprise_repository.get_reporting_window(enterprise_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    return {
        **profile,
        "reporting_window_status": window["status"],
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
    window = enterprise_repository.get_reporting_window(enterprise_id)
    if not window:
        raise DomainNotFoundError("Enterprise reporting window not found")

    return window
