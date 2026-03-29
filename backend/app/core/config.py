from functools import lru_cache
from ipaddress import ip_address
from typing import Literal
from urllib.parse import urlparse

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


CameraSourceMode = Literal["mock", "live_webcam", "ip_webcam"]


class Settings(BaseSettings):
    app_name: str = "LGU Dashboard Mock API"
    app_version: str = "1.0.0"
    debug: bool = False
    cors_origins: str = "*"  # Comma-separated string, parsed later
    cors_allow_credentials: bool = True
    cors_allow_methods: str = "*"  # Comma-separated string
    cors_allow_headers: str = "*"  # Comma-separated string

    # Supabase Configuration
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    # Data Retention Settings
    detection_retention_days: int = 30

    # IP Webcam Configuration
    camera_source_mode: CameraSourceMode = "mock"
    ip_webcam_enabled: bool = True
    ip_webcam_base_url: str = "http://192.168.1.4:8080"
    ip_webcam_video_path: str = "/video"
    ip_webcam_snapshot_path: str = "/shot.jpg"
    ip_webcam_connect_timeout_seconds: float = 5.0
    ip_webcam_read_timeout_seconds: float = 10.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse CORS origins from comma-separated string."""
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cors_allow_methods_list(self) -> list[str]:
        """Parse CORS methods from comma-separated string."""
        if self.cors_allow_methods == "*":
            return ["*"]
        return [method.strip() for method in self.cors_allow_methods.split(",") if method.strip()]

    @property
    def cors_allow_headers_list(self) -> list[str]:
        """Parse CORS headers from comma-separated string."""
        if self.cors_allow_headers == "*":
            return ["*"]
        return [header.strip() for header in self.cors_allow_headers.split(",") if header.strip()]

    @property
    def supabase_enabled(self) -> bool:
        # Check if credentials are real (not placeholder values)
        return bool(
            self.supabase_url
            and self.supabase_service_role_key
            and not self.supabase_service_role_key.startswith("your_")
            and len(self.supabase_service_role_key) > 50  # Real keys are much longer
        )

    @property
    def ip_webcam_video_url(self) -> str:
        """Build full URL for video stream endpoint."""
        base = self.ip_webcam_base_url.rstrip("/")
        path = self.ip_webcam_video_path if self.ip_webcam_video_path.startswith("/") else f"/{self.ip_webcam_video_path}"
        return f"{base}{path}"

    @property
    def ip_webcam_snapshot_url(self) -> str:
        """Build full URL for snapshot endpoint."""
        base = self.ip_webcam_base_url.rstrip("/")
        path = self.ip_webcam_snapshot_path if self.ip_webcam_snapshot_path.startswith("/") else f"/{self.ip_webcam_snapshot_path}"
        return f"{base}{path}"

    def is_ip_webcam_url_safe(self, url: str) -> bool:
        """Validate URL is in private network range (SSRF prevention)."""
        try:
            parsed = urlparse(url)
            host = parsed.hostname
            if not host:
                return False
            # Allow private IPv4 ranges
            ip = ip_address(host)
            return ip.is_private and not ip.is_loopback
        except ValueError:
            # Hostname not an IP - could be local DNS name, allow if it resolves to private
            return host in ("localhost",) or host.endswith(".local")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
