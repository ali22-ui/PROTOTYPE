from app.domain import core_runtime as core
from app.state import runtime_store


def resolve_enterprise_id(enterprise_id: str) -> str:
    return core.resolve_enterprise_id(enterprise_id)


def list_enterprises() -> list[dict]:
    return core.ENTERPRISES


def list_enterprise_accounts() -> list[dict]:
    return core.ENTERPRISE_ACCOUNTS


def get_enterprise_account(enterprise_id: str) -> dict | None:
    target_id = resolve_enterprise_id(enterprise_id)
    return next((item for item in core.ENTERPRISE_ACCOUNTS if item["enterprise_id"] == target_id), None)


def get_enterprise_profile(enterprise_id: str) -> dict | None:
    target_id = resolve_enterprise_id(enterprise_id)
    return core.ENTERPRISE_PROFILE_LOOKUP.get(target_id)


def get_reporting_window(enterprise_id: str) -> dict | None:
    target_id = resolve_enterprise_id(enterprise_id)
    return runtime_store.get_reporting_windows().get(target_id)


def get_archies_profile() -> dict:
    return core.ARCHIES_ENTERPRISE_PROFILE


def get_dashboard_payload(date: str | None = None, enterprise_id: str = "ent_archies_001") -> dict:
    target_id = resolve_enterprise_id(enterprise_id)
    return core.build_archies_dashboard_payload(date, target_id)


def list_recommendations() -> list[dict]:
    return [
        {
            "id": "rec_1",
            "feature": "Staffing Level Optimization Prediction",
            "recommendation": "Add 2 floor staff during 12:00 PM - 2:00 PM peak windows.",
            "confidence": 0.89,
        },
        {
            "id": "rec_2",
            "feature": "Dwell Time & Traffic Anomaly Alerts",
            "recommendation": "Trigger anomaly alert when dwell exceeds 95 minutes in 2 consecutive intervals.",
            "confidence": 0.83,
        },
        {
            "id": "rec_3",
            "feature": "Multi-Camera Path Tracing",
            "recommendation": "Enable re-identification across entrances to measure visitor movement funnel.",
            "confidence": 0.78,
        },
        {
            "id": "rec_4",
            "feature": "Customer Density Heatmapping",
            "recommendation": "Render 15-minute heatmaps and auto-alert on congestion zones.",
            "confidence": 0.86,
        },
        {
            "id": "rec_5",
            "feature": "Campaign Conversion Overlay",
            "recommendation": "Correlate promo windows with footfall and dwell to optimize campaign spend.",
            "confidence": 0.74,
        },
        {
            "id": "rec_6",
            "feature": "Queue Time Estimator",
            "recommendation": "Predict queue build-up by entrance and trigger lane staffing recommendation.",
            "confidence": 0.8,
        },
        {
            "id": "rec_7",
            "feature": "Maintenance Risk Scoring",
            "recommendation": "Automatically score camera downtime risk from FPS and tracking drops.",
            "confidence": 0.77,
        },
    ]
