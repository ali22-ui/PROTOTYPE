"""
Supabase client configuration and initialization.
Provides a singleton client for database operations.
"""
from functools import lru_cache
from typing import Optional

from supabase import Client, create_client

from app.core.config import get_settings


_supabase_client: Optional[Client] = None
_supabase_checked: bool = False


def get_supabase_client() -> Optional[Client]:
    """
    Get the Supabase client instance.
    Returns None if Supabase is not configured.
    """
    global _supabase_client, _supabase_checked
    
    if _supabase_checked:
        return _supabase_client
    
    settings = get_settings()
    
    if not settings.supabase_enabled:
        _supabase_checked = True
        _supabase_client = None
        return None
    
    try:
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
        )
        _supabase_checked = True
    except Exception as e:
        print(f"Failed to create Supabase client: {e}")
        _supabase_client = None
        _supabase_checked = True
    
    return _supabase_client


def is_supabase_available() -> bool:
    """Check if Supabase is configured and available."""
    return get_supabase_client() is not None


def reset_supabase_client() -> None:
    """Reset the client for testing or config changes."""
    global _supabase_client, _supabase_checked
    _supabase_client = None
    _supabase_checked = False
