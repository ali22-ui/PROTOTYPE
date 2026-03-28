"""
Supabase client configuration and initialization.
Provides a singleton client for database operations.
"""
from functools import lru_cache
from typing import Optional

from supabase import Client, create_client

from app.core.config import get_settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Optional[Client]:
    """
    Get the Supabase client instance.
    Returns None if Supabase is not configured.
    """
    settings = get_settings()
    
    if not settings.supabase_enabled:
        return None
    
    return create_client(
        settings.supabase_url,
        settings.supabase_service_role_key,
    )


def is_supabase_available() -> bool:
    """Check if Supabase is configured and available."""
    return get_supabase_client() is not None
