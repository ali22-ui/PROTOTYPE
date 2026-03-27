from app.repositories.mock_repository import get_core_module


core = get_core_module()


def export_enterprise_csv(enterprise_id: str):
    return core.export_enterprise_csv(enterprise_id)


def export_enterprise_pdf(enterprise_id: str):
    return core.export_enterprise_pdf(enterprise_id)


def download_authority_package_pdf(report_id: str):
    return core.download_authority_package_pdf(report_id)


def download_authority_package_docx(report_id: str):
    return core.download_authority_package_docx(report_id)
