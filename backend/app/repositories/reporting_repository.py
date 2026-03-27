from app.domain import core_runtime as core
from app.state import runtime_store


def list_report_packs() -> list[dict]:
    return runtime_store.get_lgu_report_packs()


def add_report_pack(report_pack: dict) -> None:
    runtime_store.get_lgu_report_packs().append(report_pack)


def get_report_by_id(report_id: str) -> dict | None:
    return next((item for item in runtime_store.get_lgu_report_packs() if item["report_id"] == report_id), None)


def list_authority_packages() -> dict:
    return runtime_store.get_authority_packages()


def list_action_logs() -> list[dict]:
    return runtime_store.get_enterprise_action_logs()


def build_report_pack(period: str, enterprise_id: str) -> dict:
    return core.build_report_pack(period, enterprise_id)


def compute_report_statistics(report: dict) -> dict:
    return core.compute_report_statistics(report)


def build_professional_authority_pdf(report: dict, package: dict, stats: dict) -> bytes:
    return core.build_professional_authority_pdf(report, package, stats)


def build_minimal_docx(lines: list[str]) -> bytes:
    return core.build_minimal_docx(lines)


def build_minimal_pdf(lines: list[str]) -> bytes:
    return core.build_minimal_pdf(lines)
