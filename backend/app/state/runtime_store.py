from app.repositories.mock_repository import get_core_module


core = get_core_module()


def get_camera_runtime():
    return core.CAMERA_RUNTIME


def get_camera_subscribers():
    return core.CAMERA_SUBSCRIBERS


def get_reporting_windows():
    return core.REPORTING_WINDOWS
