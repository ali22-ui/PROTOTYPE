from copy import deepcopy
from typing import TYPE_CHECKING

from app.domain import core_runtime as core

if TYPE_CHECKING:
    from app.services.ip_camera_service import SourceState


# Runtime state must be owned by the state layer, not by shared module globals.
REPORTING_WINDOWS = {}
CAMERA_RUNTIME = {}
CAMERA_SUBSCRIBERS = {}
CAMERA_BROADCAST_TASKS = {}
CAMERA_RECENT_EVENTS = {}
LGU_REPORT_PACKS = []
AUTHORITY_PACKAGES = {}
ENTERPRISE_ACTION_LOGS = []
CAMERA_SOURCE_STATES: dict[str, "SourceState"] = {}
SYSTEM_SETTINGS = {}
SUBMITTED_REPORTS: dict[str, dict] = {}  # Runtime storage for submitted reports


def reset_runtime_state() -> None:
    """Reset all runtime state to initial values."""
    REPORTING_WINDOWS.clear()
    REPORTING_WINDOWS.update(deepcopy(core.REPORTING_WINDOWS))

    CAMERA_RUNTIME.clear()
    CAMERA_RUNTIME.update(deepcopy(core.CAMERA_RUNTIME))

    CAMERA_SUBSCRIBERS.clear()
    CAMERA_SUBSCRIBERS.update({enterprise_id: set() for enterprise_id in CAMERA_RUNTIME})

    CAMERA_BROADCAST_TASKS.clear()

    CAMERA_RECENT_EVENTS.clear()
    CAMERA_RECENT_EVENTS.update({enterprise_id: [] for enterprise_id in CAMERA_RUNTIME})

    LGU_REPORT_PACKS.clear()
    LGU_REPORT_PACKS.extend(deepcopy(core.LGU_REPORT_PACKS))

    AUTHORITY_PACKAGES.clear()
    ENTERPRISE_ACTION_LOGS.clear()
    CAMERA_SOURCE_STATES.clear()

    SYSTEM_SETTINGS.clear()
    SYSTEM_SETTINGS.update(
        {
            "id": 1,
            "is_reporting_window_open": False,
            "updated_at": "",
            "updated_by": "system",
        }
    )


def reset_telemetry_state() -> None:
    """
    Reset camera telemetry counters without affecting reference data.
    Use this for clean baseline testing of real camera data.
    """
    for enterprise_id in CAMERA_RUNTIME:
        CAMERA_RUNTIME[enterprise_id] = {
            "frame": 0,
            "events": [],
            "latest_frame": None,
        }
        CAMERA_RECENT_EVENTS[enterprise_id] = []

    # Clear camera source states to force re-initialization
    CAMERA_SOURCE_STATES.clear()

    # Clear any cached broadcast tasks
    for task in CAMERA_BROADCAST_TASKS.values():
        if not task.done():
            task.cancel()
    CAMERA_BROADCAST_TASKS.clear()


def get_camera_runtime():
    return CAMERA_RUNTIME


def get_camera_subscribers():
    return CAMERA_SUBSCRIBERS


def get_camera_broadcast_tasks():
    return CAMERA_BROADCAST_TASKS


def get_camera_recent_events():
    return CAMERA_RECENT_EVENTS


def append_camera_event(enterprise_id: str, event_text: str, max_items: int = 100) -> None:
    events = CAMERA_RECENT_EVENTS.setdefault(enterprise_id, [])
    events.insert(0, event_text)
    if len(events) > max_items:
        del events[max_items:]


def get_reporting_windows():
    return REPORTING_WINDOWS


def get_lgu_report_packs():
    return LGU_REPORT_PACKS


def get_authority_packages():
    return AUTHORITY_PACKAGES


def get_enterprise_action_logs():
    return ENTERPRISE_ACTION_LOGS


def get_system_settings() -> dict:
    return SYSTEM_SETTINGS


def set_reporting_window_open(
    is_open: bool,
    updated_by: str = "system",
    updated_at: str | None = None,
) -> dict:
    SYSTEM_SETTINGS["id"] = 1
    SYSTEM_SETTINGS["is_reporting_window_open"] = bool(is_open)
    SYSTEM_SETTINGS["updated_by"] = updated_by
    if updated_at is not None:
        SYSTEM_SETTINGS["updated_at"] = updated_at
    elif "updated_at" not in SYSTEM_SETTINGS:
        SYSTEM_SETTINGS["updated_at"] = ""
    return SYSTEM_SETTINGS


def get_camera_source_states():
    return CAMERA_SOURCE_STATES


def get_submitted_reports() -> dict[str, dict]:
    """Get all submitted reports from runtime storage."""
    return SUBMITTED_REPORTS


def set_submitted_reports(reports: dict[str, dict]) -> None:
    """Set the submitted reports in runtime storage."""
    SUBMITTED_REPORTS.clear()
    SUBMITTED_REPORTS.update(reports)


def add_submitted_report(report_id: str, report: dict) -> None:
    """Add a single submitted report to runtime storage."""
    SUBMITTED_REPORTS[report_id] = report


reset_runtime_state()
