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
LGU_REPORT_PACKS = []
AUTHORITY_PACKAGES = {}
ENTERPRISE_ACTION_LOGS = []
CAMERA_SOURCE_STATES: dict[str, "SourceState"] = {}


def reset_runtime_state() -> None:
    """Reset all runtime state to initial values."""
    REPORTING_WINDOWS.clear()
    REPORTING_WINDOWS.update(deepcopy(core.REPORTING_WINDOWS))

    CAMERA_RUNTIME.clear()
    CAMERA_RUNTIME.update(deepcopy(core.CAMERA_RUNTIME))

    CAMERA_SUBSCRIBERS.clear()
    CAMERA_SUBSCRIBERS.update({enterprise_id: set() for enterprise_id in CAMERA_RUNTIME})

    CAMERA_BROADCAST_TASKS.clear()

    LGU_REPORT_PACKS.clear()
    LGU_REPORT_PACKS.extend(deepcopy(core.LGU_REPORT_PACKS))

    AUTHORITY_PACKAGES.clear()
    ENTERPRISE_ACTION_LOGS.clear()
    CAMERA_SOURCE_STATES.clear()


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


def get_reporting_windows():
    return REPORTING_WINDOWS


def get_lgu_report_packs():
    return LGU_REPORT_PACKS


def get_authority_packages():
    return AUTHORITY_PACKAGES


def get_enterprise_action_logs():
    return ENTERPRISE_ACTION_LOGS


def get_camera_source_states():
    return CAMERA_SOURCE_STATES


reset_runtime_state()
