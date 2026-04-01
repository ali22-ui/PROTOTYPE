"""
Supabase-backed repositories for unified data architecture.
PRD_011: Unified Supabase Data Architecture Migration

This module provides repository implementations that persist data to Supabase
instead of in-memory runtime stores.
"""

import logging
from datetime import datetime
from typing import Optional

from postgrest.exceptions import APIError

from app.core.supabase import get_supabase_client, is_supabase_available
from app.state import runtime_store
from domain_exceptions import DomainServiceUnavailableError

logger = logging.getLogger(__name__)


class SupabaseRepository:
    """Base class for Supabase repositories with common utilities."""

    @staticmethod
    def _get_client():
        """Get the Supabase client or raise if unavailable."""
        client = get_supabase_client()
        if not client:
            raise RuntimeError("Supabase client is not available")
        return client

    @staticmethod
    def _now_iso() -> str:
        """Return current timestamp in ISO format with timezone."""
        return datetime.now().strftime("%Y-%m-%dT%H:%M:%S-08:00")

    @staticmethod
    def _current_period() -> str:
        """Return current period in YYYY-MM format."""
        return datetime.now().strftime("%Y-%m")

    @staticmethod
    def _extract_api_error(error: APIError) -> tuple[str, str]:
        """Extract best-effort code/message from APIError payload variants."""
        error_code = ""
        error_message = str(error)

        raw_payload = error.args[0] if error.args else None
        if isinstance(raw_payload, dict):
            maybe_code = raw_payload.get("code")
            maybe_message = raw_payload.get("message")
            if isinstance(maybe_code, str):
                error_code = maybe_code
            if isinstance(maybe_message, str) and maybe_message:
                error_message = maybe_message
        elif isinstance(raw_payload, str) and raw_payload:
            error_message = raw_payload

        if not error_code and "42501" in f"{error_message} {error}":
            error_code = "42501"

        return error_code, error_message

    @staticmethod
    def _chunk_values(values: list[str], chunk_size: int = 100) -> list[list[str]]:
        """Split values into chunks for batched PostgREST filters."""
        if chunk_size <= 0:
            return [values]
        return [values[index:index + chunk_size] for index in range(0, len(values), chunk_size)]


class ReportingWindowRepository(SupabaseRepository):
    """Repository for reporting window operations."""

    TABLE = "reporting_windows"

    def get_by_enterprise(self, enterprise_id: str, period: Optional[str] = None) -> Optional[dict]:
        """Get reporting window for an enterprise, optionally filtered by period."""
        client = self._get_client()
        query = client.table(self.TABLE).select("*").eq("enterprise_id", enterprise_id)

        if period:
            query = query.eq("period", period)
        else:
            query = query.order("period", desc=True).limit(1)

        try:
            result = query.execute()
            if result.data and len(result.data) > 0:
                return self._to_dict(result.data[0])
            return None
        except APIError as e:
            error_code, error_msg = self._extract_api_error(e)
            
            if error_code == "42501":  # Permission denied
                logger.warning(f"Permission denied for {self.TABLE}: {error_msg}")
                raise DomainServiceUnavailableError(
                    f"Database access denied for reporting windows. Please check Supabase RLS policies."
                )
            raise

    def get_by_enterprise_current(self, enterprise_id: str) -> Optional[dict]:
        """Get current period reporting window for an enterprise."""
        return self.get_by_enterprise(enterprise_id, self._current_period())

    def list_by_period(self, period: str) -> list[dict]:
        """List all reporting windows for a given period."""
        client = self._get_client()
        try:
            result = client.table(self.TABLE).select("*").eq("period", period).execute()
            return [self._to_dict(row) for row in result.data] if result.data else []
        except APIError as e:
            error_code, error_msg = self._extract_api_error(e)
            
            if error_code == "42501":  # Permission denied
                logger.warning(f"Permission denied for {self.TABLE}: {error_msg}")
                raise DomainServiceUnavailableError(
                    f"Database access denied for reporting windows. Please check Supabase RLS policies."
                )
            raise

    def list_by_period_for_enterprises(self, period: str, enterprise_ids: list[str]) -> list[dict]:
        """List reporting windows for a period filtered to the provided enterprise IDs."""
        if not enterprise_ids:
            return []

        client = self._get_client()
        rows: list[dict] = []

        try:
            for chunk in self._chunk_values(enterprise_ids):
                result = (
                    client.table(self.TABLE)
                    .select("*")
                    .eq("period", period)
                    .in_("enterprise_id", chunk)
                    .execute()
                )
                if result.data:
                    rows.extend(result.data)
            return [self._to_dict(row) for row in rows]
        except APIError as e:
            error_code, error_msg = self._extract_api_error(e)

            if error_code == "42501":
                logger.warning(f"Permission denied for {self.TABLE}: {error_msg}")
                raise DomainServiceUnavailableError(
                    "Database access denied for reporting windows. Please check Supabase RLS policies."
                )
            raise

    def list_current_by_enterprises(self, enterprise_ids: list[str]) -> list[dict]:
        """List current-period reporting windows for the provided enterprise IDs."""
        return self.list_by_period_for_enterprises(self._current_period(), enterprise_ids)

    def list_all_current(self) -> list[dict]:
        """List all reporting windows for the current period."""
        return self.list_by_period(self._current_period())

    def upsert(
        self,
        enterprise_id: str,
        period: str,
        status: str,
        opened_by: Optional[str] = None,
        message: Optional[str] = None,
    ) -> dict:
        """Create or update a reporting window.
        
        Note: PRD_013 simplified schema - removed scope column.
        """
        client = self._get_client()
        now = self._now_iso()

        data = {
            "enterprise_id": enterprise_id,
            "period": period,
            "status": status,
            "updated_at": now,
        }

        if status in ("OPEN", "REMIND", "WARN", "RENOTIFY"):
            data["opened_at"] = now
            if opened_by:
                data["opened_by"] = opened_by
        elif status == "CLOSED":
            data["closed_at"] = now
            if opened_by:
                data["closed_by"] = opened_by

        if message:
            data["message"] = message

        result = client.table(self.TABLE).upsert(
            data,
            on_conflict="enterprise_id,period"
        ).execute()

        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return data

    def open_window(
        self,
        enterprise_id: str,
        period: str,
        opened_by: str = "lgu_admin_01",
        message: Optional[str] = None,
        status: str = "OPEN",
    ) -> dict:
        """Open a reporting window for an enterprise."""
        return self.upsert(
            enterprise_id=enterprise_id,
            period=period,
            status=status,
            opened_by=opened_by,
            message=message,
        )

    def close_window(
        self,
        enterprise_id: str,
        period: str,
        closed_by: str = "lgu_admin_01",
        message: Optional[str] = None,
    ) -> dict:
        """Close a reporting window for an enterprise."""
        return self.upsert(
            enterprise_id=enterprise_id,
            period=period,
            status="CLOSED",
            opened_by=closed_by,
            message=message,
        )

    def mark_submitted(self, enterprise_id: str, period: str) -> dict:
        """Mark a reporting window as submitted."""
        return self.upsert(
            enterprise_id=enterprise_id,
            period=period,
            status="SUBMITTED",
        )

    def open_all(self, period: str, opened_by: str = "lgu_admin_01") -> int:
        """Open reporting windows for all enterprises."""
        client = self._get_client()
        enterprises = client.table("enterprises").select("id").execute()
        count = 0
        if enterprises.data:
            for enterprise in enterprises.data:
                self.open_window(enterprise["id"], period, opened_by)
                count += 1
        return count

    def close_all(self, period: str, closed_by: str = "lgu_admin_01") -> int:
        """Close reporting windows for all enterprises."""
        client = self._get_client()
        enterprises = client.table("enterprises").select("id").execute()
        count = 0
        if enterprises.data:
            for enterprise in enterprises.data:
                self.close_window(enterprise["id"], period, closed_by)
                count += 1
        return count

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format.
        
        Note: PRD_013 simplified schema - removed scope column.
        """
        return {
            "enterprise_id": row.get("enterprise_id"),
            "period": row.get("period"),
            "status": row.get("status"),
            "opened_at": row.get("opened_at"),
            "opened_by": row.get("opened_by"),
            "closed_at": row.get("closed_at"),
            "closed_by": row.get("closed_by"),
            "message": row.get("message"),
        }


class ReportSubmissionRepository(SupabaseRepository):
    """Repository for report submission operations."""

    TABLE = "report_submissions"

    def get_by_id(self, report_id: str) -> Optional[dict]:
        """Get a report by its ID."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").eq("id", report_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    def list_by_enterprise(self, enterprise_id: str) -> list[dict]:
        """List all reports for an enterprise."""
        client = self._get_client()
        try:
            result = (
                client.table(self.TABLE)
                .select("*")
                .eq("enterprise_id", enterprise_id)
                .order("submitted_at", desc=True)
                .execute()
            )
        except APIError as e:
            error_code, error_msg = self._extract_api_error(e)
            if error_code in {"42501", "42P01"}:
                logger.warning(f"Report submissions read denied for {self.TABLE}: {error_msg}")
                raise DomainServiceUnavailableError(
                    "Database access denied for report submissions. Please check Supabase permissions and migrations."
                )
            raise
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_by_period(self, period: str, enterprise_id: Optional[str] = None) -> list[dict]:
        """List reports for a period, optionally filtered by enterprise."""
        client = self._get_client()
        query = client.table(self.TABLE).select("*").eq("period", period)
        if enterprise_id:
            query = query.eq("enterprise_id", enterprise_id)
        result = query.order("submitted_at", desc=True).execute()
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_all(self) -> list[dict]:
        """List all reports."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").order("submitted_at", desc=True).execute()
        return [self._to_dict(row) for row in result.data] if result.data else []

    def exists(self, enterprise_id: str, period: str) -> bool:
        """Check if a report exists for enterprise and period."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("id")
            .eq("enterprise_id", enterprise_id)
            .eq("period", period)
            .execute()
        )
        return bool(result.data and len(result.data) > 0)

    def list_submitted_enterprise_ids_for_period(self, period: str, enterprise_ids: list[str]) -> set[str]:
        """Return enterprise IDs that have submitted a report in the given period."""
        if not enterprise_ids:
            return set()

        client = self._get_client()
        submitted_enterprises: set[str] = set()

        try:
            for chunk in self._chunk_values(enterprise_ids):
                result = (
                    client.table(self.TABLE)
                    .select("enterprise_id")
                    .eq("period", period)
                    .in_("enterprise_id", chunk)
                    .execute()
                )

                if not result.data:
                    continue

                for row in result.data:
                    enterprise_id = row.get("enterprise_id")
                    if isinstance(enterprise_id, str) and enterprise_id:
                        submitted_enterprises.add(enterprise_id)

            return submitted_enterprises
        except APIError as e:
            error_code, error_msg = self._extract_api_error(e)
            if error_code in {"42501", "42P01"}:
                logger.warning(f"Report submissions read denied for {self.TABLE}: {error_msg}")
                raise DomainServiceUnavailableError(
                    "Database access denied for report submissions. Please check Supabase permissions and migrations."
                )
            raise

    def create(
        self,
        enterprise_id: str,
        period: str,
        linked_lgu_id: Optional[str] = None,
        submitted_by: Optional[str] = None,
        total_visitors: int = 0,
        male_count: int = 0,
        female_count: int = 0,
        row_count: int = 0,
        notes: Optional[str] = None,
        **kwargs,
    ) -> dict:
        """Create a new report submission.
        
        Note: PRD_013 simplified schema - removed payload, enterprise_name, source columns.
        KPIs should be pre-calculated and passed directly.
        """
        client = self._get_client()
        report_id = f"rpt_{enterprise_id}_{period.replace('-', '_')}"

        data = {
            "id": report_id,
            "enterprise_id": enterprise_id,
            "period": period,
            "linked_lgu_id": linked_lgu_id,
            "status": "SUBMITTED",
            "submitted_at": self._now_iso(),
            "submitted_by": submitted_by,
            "total_visitors": total_visitors,
            "male_count": male_count,
            "female_count": female_count,
            "row_count": row_count,
            "notes": notes,
            **kwargs,
        }

        result = client.table(self.TABLE).insert(data).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return self._to_dict(data)

    def upsert(
        self,
        enterprise_id: str,
        period: str,
        **kwargs,
    ) -> dict:
        """Create or update a report submission.
        
        Note: PRD_013 simplified schema - enterprise_name removed (lookup from enterprises table).
        """
        client = self._get_client()
        report_id = f"rpt_{enterprise_id}_{period.replace('-', '_')}"

        data = {
            "id": report_id,
            "enterprise_id": enterprise_id,
            "period": period,
            "updated_at": self._now_iso(),
            **kwargs,
        }

        result = client.table(self.TABLE).upsert(
            data,
            on_conflict="enterprise_id,period"
        ).execute()

        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return self._to_dict(data)

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format.
        
        Note: PRD_013 simplified schema - removed payload, source, enterprise_name.
        tourist/resident counts removed (can be derived from visitor_statistics if needed).
        """
        return {
            "report_id": row.get("id"),
            "enterprise_id": row.get("enterprise_id"),
            "linked_lgu_id": row.get("linked_lgu_id"),
            "period": {"month": row.get("period")},
            "status": row.get("status"),
            "submitted_at": row.get("submitted_at"),
            "submitted_by": row.get("submitted_by"),
            "kpis": {
                "total_visitors": row.get("total_visitors", 0),
                "male_count": row.get("male_count", 0),
                "female_count": row.get("female_count", 0),
            },
            "row_count": row.get("row_count", 0),
            "notes": row.get("notes"),
        }


class AuthorityPackageRepository(SupabaseRepository):
    """Repository for authority package operations."""

    TABLE = "authority_packages"

    def get_by_id(self, package_id: str) -> Optional[dict]:
        """Get an authority package by its ID."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").eq("id", package_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    def get_by_report(self, report_id: str) -> Optional[dict]:
        """Get authority package for a specific report."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("report_id", report_id)
            .order("generated_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    def list_by_enterprise(self, enterprise_id: str) -> list[dict]:
        """List all authority packages for an enterprise."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("enterprise_id", enterprise_id)
            .order("generated_at", desc=True)
            .execute()
        )
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_all(self) -> dict[str, dict]:
        """List all authority packages, keyed by report_id."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").execute()
        packages = {}
        if result.data:
            for row in result.data:
                packages[row.get("report_id")] = self._to_dict(row)
        return packages

    def create(
        self,
        report_id: str,
        enterprise_id: str,
        period: str,
        executive_summary: dict,
        generated_by: Optional[str] = None,
    ) -> dict:
        """Create a new authority package.
        
        Note: PRD_013 simplified schema - removed compliance_notes, attachments columns.
        """
        client = self._get_client()
        now = self._now_iso()
        package_id = f"auth_{report_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        data = {
            "id": package_id,
            "report_id": report_id,
            "enterprise_id": enterprise_id,
            "period": period,
            "classification": "READY_FOR_HIGHER_AUTHORITY_SUBMISSION",
            "generated_at": now,
            "generated_by": generated_by or "lgu_admin_01",
            "executive_summary": executive_summary,
        }

        result = client.table(self.TABLE).insert(data).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return self._to_dict(data)

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format.
        
        Note: PRD_013 simplified schema - removed compliance_notes, attachments.
        """
        return {
            "authority_package_id": row.get("id"),
            "report_id": row.get("report_id"),
            "enterprise_id": row.get("enterprise_id"),
            "period": row.get("period"),
            "classification": row.get("classification"),
            "generated_at": row.get("generated_at"),
            "generated_by": row.get("generated_by"),
            "executive_summary": row.get("executive_summary", {}),
        }


class EnterpriseActionRepository(SupabaseRepository):
    """Repository for enterprise action ticket operations."""

    TABLE = "enterprise_action_tickets"

    def get_by_id(self, ticket_id: str) -> Optional[dict]:
        """Get a ticket by its ID."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").eq("id", ticket_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    def list_by_enterprise(self, enterprise_id: str) -> list[dict]:
        """List all tickets for an enterprise."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("enterprise_id", enterprise_id)
            .order("created_at", desc=True)
            .execute()
        )
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_all(self) -> list[dict]:
        """List all tickets."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").order("created_at", desc=True).execute()
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_by_type(self, ticket_type: str) -> list[dict]:
        """List all tickets of a specific type."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("ticket_type", ticket_type)
            .order("created_at", desc=True)
            .execute()
        )
        return [self._to_dict(row) for row in result.data] if result.data else []

    def create(
        self,
        enterprise_id: str,
        ticket_type: str,
        message: Optional[str] = None,
        priority: str = "normal",
    ) -> dict:
        """Create a new action ticket."""
        client = self._get_client()
        now = datetime.now()
        ticket_id = f"{ticket_type.replace('-', '_')}_{now.strftime('%Y%m%d%H%M%S')}"

        data = {
            "id": ticket_id,
            "enterprise_id": enterprise_id,
            "ticket_type": ticket_type,
            "status": "open",
            "message": message,
            "priority": priority,
            "created_at": self._now_iso(),
        }

        result = client.table(self.TABLE).insert(data).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return self._to_dict(data)

    def update_status(
        self,
        ticket_id: str,
        status: str,
        resolved_by: Optional[str] = None,
        resolution_notes: Optional[str] = None,
    ) -> Optional[dict]:
        """Update ticket status."""
        client = self._get_client()
        data = {
            "status": status,
            "updated_at": self._now_iso(),
        }

        if status in ("resolved", "closed") and resolved_by:
            data["resolved_at"] = self._now_iso()
            data["resolved_by"] = resolved_by
            if resolution_notes:
                data["resolution_notes"] = resolution_notes

        result = client.table(self.TABLE).update(data).eq("id", ticket_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format."""
        return {
            "ticket_id": row.get("id"),
            "enterprise_id": row.get("enterprise_id"),
            "type": row.get("ticket_type"),
            "status": row.get("status"),
            "message": row.get("message"),
            "priority": row.get("priority"),
            "assigned_to": row.get("assigned_to"),
            "resolved_at": row.get("resolved_at"),
            "resolved_by": row.get("resolved_by"),
            "resolution_notes": row.get("resolution_notes"),
            "created_at": row.get("created_at"),
        }


class LguRepository(SupabaseRepository):
    """Repository for LGU operations.
    
    PRD_013: LGU settings are now flattened into the lgus table (no separate lgu_settings).
    """

    TABLE = "lgus"

    def get_by_id(self, lgu_id: str) -> Optional[dict]:
        """Get an LGU by its ID."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").eq("id", lgu_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    def list_all(self) -> list[dict]:
        """List all LGUs."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").execute()
        return [self._to_dict(row) for row in result.data] if result.data else []

    def get_settings(self, lgu_id: str) -> dict:
        """Get settings for an LGU (now stored as columns in lgus table)."""
        lgu = self.get_by_id(lgu_id)
        if lgu:
            return {
                "reporting_reminder_days": lgu.get("reporting_reminder_days", 7),
                "reporting_warning_days": lgu.get("reporting_warning_days", 3),
                "timezone": lgu.get("timezone", "Asia/Manila"),
            }
        return {
            "reporting_reminder_days": 7,
            "reporting_warning_days": 3,
            "timezone": "Asia/Manila",
        }

    def update_settings(
        self,
        lgu_id: str,
        reporting_reminder_days: Optional[int] = None,
        reporting_warning_days: Optional[int] = None,
        timezone: Optional[str] = None,
    ) -> Optional[dict]:
        """Update LGU settings."""
        client = self._get_client()
        data: dict = {"updated_at": self._now_iso()}
        
        if reporting_reminder_days is not None:
            data["reporting_reminder_days"] = reporting_reminder_days
        if reporting_warning_days is not None:
            data["reporting_warning_days"] = reporting_warning_days
        if timezone is not None:
            data["timezone"] = timezone

        result = client.table(self.TABLE).update(data).eq("id", lgu_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format."""
        return {
            "id": row.get("id"),
            "name": row.get("name"),
            "city": row.get("city"),
            "province": row.get("province"),
            "contact_email": row.get("contact_email"),
            "reporting_reminder_days": row.get("reporting_reminder_days", 7),
            "reporting_warning_days": row.get("reporting_warning_days", 3),
            "timezone": row.get("timezone", "Asia/Manila"),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        }


class LguSettingsRepository(SupabaseRepository):
    """DEPRECATED: Repository for LGU settings operations.
    
    PRD_013: This table no longer exists. Settings are now columns in the lgus table.
    Use LguRepository.get_settings() and LguRepository.update_settings() instead.
    
    This class is kept for backward compatibility but delegates to LguRepository.
    """

    def __init__(self):
        self._lgu_repo = LguRepository()

    def get(self, lgu_id: str, setting_key: str) -> Optional[dict]:
        """Get a specific setting for an LGU."""
        settings = self._lgu_repo.get_settings(lgu_id)
        if setting_key in settings:
            return {"lgu_id": lgu_id, "setting_key": setting_key, "setting_value": settings[setting_key]}
        return None

    def get_value(self, lgu_id: str, setting_key: str, default=None):
        """Get the value of a specific setting."""
        settings = self._lgu_repo.get_settings(lgu_id)
        return settings.get(setting_key, default)

    def list_by_lgu(self, lgu_id: str) -> dict:
        """List all settings for an LGU as a key-value dict."""
        return self._lgu_repo.get_settings(lgu_id)

    def upsert(self, lgu_id: str, setting_key: str, setting_value) -> dict:
        """Create or update a setting."""
        kwargs = {setting_key: setting_value}
        self._lgu_repo.update_settings(lgu_id, **kwargs)
        return {"lgu_id": lgu_id, "setting_key": setting_key, "setting_value": setting_value}

    def delete(self, lgu_id: str, setting_key: str) -> bool:
        """Delete a specific setting (reset to default)."""
        # In the new schema, we can't really delete - just reset to default
        defaults = {
            "reporting_reminder_days": 7,
            "reporting_warning_days": 3,
            "timezone": "Asia/Manila",
        }
        if setting_key in defaults:
            self._lgu_repo.update_settings(lgu_id, **{setting_key: defaults[setting_key]})
            return True
        return False


class SystemSettingsRepository(SupabaseRepository):
    """Repository for global system settings shared across portals."""

    TABLE = "system_settings"
    PRIMARY_ID = 1

    @staticmethod
    def _normalize_bool(value: object) -> bool:
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "yes", "on", "open"}
        if isinstance(value, (int, float)):
            return value != 0
        return False

    def _normalize_row(self, row: dict) -> dict:
        return {
            "id": row.get("id", self.PRIMARY_ID),
            "is_reporting_window_open": self._normalize_bool(row.get("is_reporting_window_open")),
            "updated_at": row.get("updated_at"),
            "updated_by": row.get("updated_by"),
        }

    def get_reporting_window_state(self) -> dict:
        """Get global reporting window state from system_settings table."""
        if not is_supabase_available():
            return dict(runtime_store.get_system_settings())

        client = self._get_client()

        try:
            result = (
                client.table(self.TABLE)
                .select("id,is_reporting_window_open,updated_at,updated_by")
                .eq("id", self.PRIMARY_ID)
                .limit(1)
                .execute()
            )

            if result.data and len(result.data) > 0:
                normalized = self._normalize_row(result.data[0])
            else:
                seed = {
                    "id": self.PRIMARY_ID,
                    "is_reporting_window_open": False,
                    "updated_at": self._now_iso(),
                    "updated_by": "system",
                }
                upsert_result = client.table(self.TABLE).upsert(seed, on_conflict="id").execute()
                row = upsert_result.data[0] if upsert_result.data else seed
                normalized = self._normalize_row(row)

            runtime_store.set_reporting_window_open(
                normalized["is_reporting_window_open"],
                updated_by=str(normalized.get("updated_by") or "system"),
                updated_at=str(normalized.get("updated_at") or ""),
            )

            return normalized
        except Exception:
            return dict(runtime_store.get_system_settings())

    def set_reporting_window_open(
        self,
        is_open: bool,
        updated_by: str = "lgu_admin_01",
    ) -> dict:
        """Persist global reporting window open/closed state."""
        now = self._now_iso()

        runtime_store.set_reporting_window_open(
            bool(is_open),
            updated_by=updated_by,
            updated_at=now,
        )

        if not is_supabase_available():
            return dict(runtime_store.get_system_settings())

        client = self._get_client()
        payload = {
            "id": self.PRIMARY_ID,
            "is_reporting_window_open": bool(is_open),
            "updated_at": now,
            "updated_by": updated_by,
        }

        try:
            result = client.table(self.TABLE).upsert(payload, on_conflict="id").execute()
            row = result.data[0] if result.data else payload
            normalized = self._normalize_row(row)
            runtime_store.set_reporting_window_open(
                normalized["is_reporting_window_open"],
                updated_by=str(normalized.get("updated_by") or updated_by),
                updated_at=str(normalized.get("updated_at") or now),
            )
            return normalized
        except Exception:
            return dict(runtime_store.get_system_settings())


class EnterpriseInfractionRepository(SupabaseRepository):
    """Repository for enterprise infraction operations."""

    TABLE = "enterprise_infractions"

    def get_by_id(self, infraction_id: str) -> Optional[dict]:
        """Get an infraction by its ID."""
        client = self._get_client()
        result = client.table(self.TABLE).select("*").eq("id", infraction_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    def list_by_enterprise(self, enterprise_id: str) -> list[dict]:
        """List all infractions for an enterprise."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("enterprise_id", enterprise_id)
            .order("infraction_date", desc=True)
            .execute()
        )
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_by_lgu(self, lgu_id: str) -> dict[str, list[dict]]:
        """List all infractions for an LGU, grouped by enterprise."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("lgu_id", lgu_id)
            .order("infraction_date", desc=True)
            .execute()
        )
        infractions: dict[str, list[dict]] = {}
        if result.data:
            for row in result.data:
                ent_id = row.get("enterprise_id")
                if ent_id not in infractions:
                    infractions[ent_id] = []
                infractions[ent_id].append(self._to_dict(row))
        return infractions

    def create(
        self,
        enterprise_id: str,
        lgu_id: str,
        period: str,
        infraction_type: str,
        severity: str = "warning",
        source: str = "LGU_COMPLIANCE_ACTION",
        note: Optional[str] = None,
    ) -> dict:
        """Create a new infraction record."""
        client = self._get_client()
        now = self._now_iso()
        infraction_id = f"{period}::{infraction_type}::{now}"

        data = {
            "id": infraction_id,
            "enterprise_id": enterprise_id,
            "lgu_id": lgu_id,
            "period": period,
            "infraction_date": now,
            "infraction_type": infraction_type,
            "severity": severity,
            "source": source,
            "note": note,
        }

        result = client.table(self.TABLE).insert(data).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return self._to_dict(data)

    def resolve(
        self,
        infraction_id: str,
        resolved_by: str,
    ) -> Optional[dict]:
        """Mark an infraction as resolved."""
        client = self._get_client()
        data = {
            "resolved": True,
            "resolved_at": self._now_iso(),
            "resolved_by": resolved_by,
            "updated_at": self._now_iso(),
        }

        result = client.table(self.TABLE).update(data).eq("id", infraction_id).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return None

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format."""
        return {
            "id": row.get("id"),
            "enterprise_id": row.get("enterprise_id"),
            "period": row.get("period"),
            "date": row.get("infraction_date"),
            "type": row.get("infraction_type"),
            "severity": row.get("severity"),
            "source": row.get("source"),
            "note": row.get("note"),
            "resolved": row.get("resolved", False),
            "resolved_at": row.get("resolved_at"),
            "resolved_by": row.get("resolved_by"),
        }


class ComplianceActionRepository(SupabaseRepository):
    """Repository for compliance action operations."""

    TABLE = "enterprise_compliance_actions"

    def list_by_enterprise(self, enterprise_id: str, period: Optional[str] = None) -> list[dict]:
        """List compliance actions for an enterprise."""
        client = self._get_client()
        query = client.table(self.TABLE).select("*").eq("enterprise_id", enterprise_id)
        if period:
            query = query.eq("period", period)
        result = query.order("triggered_at", desc=True).execute()
        return [self._to_dict(row) for row in result.data] if result.data else []

    def list_by_lgu_period(self, lgu_id: str, period: str) -> list[dict]:
        """List all compliance actions for an LGU in a period."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("lgu_id", lgu_id)
            .eq("period", period)
            .order("triggered_at", desc=True)
            .execute()
        )
        return [self._to_dict(row) for row in result.data] if result.data else []

    def create(
        self,
        enterprise_id: str,
        lgu_id: str,
        period: str,
        action_type: str,
        triggered_by: str,
        message: Optional[str] = None,
    ) -> dict:
        """Create a new compliance action record.
        
        Note: PRD_013 simplified schema - removed scope column.
        """
        client = self._get_client()
        data = {
            "enterprise_id": enterprise_id,
            "lgu_id": lgu_id,
            "period": period,
            "action_type": action_type,
            "triggered_by": triggered_by,
            "triggered_at": self._now_iso(),
            "message": message,
        }

        result = client.table(self.TABLE).insert(data).execute()
        if result.data and len(result.data) > 0:
            return self._to_dict(result.data[0])
        return self._to_dict(data)

    @staticmethod
    def _to_dict(row: dict) -> dict:
        """Convert database row to API response format.
        
        Note: PRD_013 simplified schema - removed scope column.
        """
        return {
            "id": row.get("id"),
            "enterprise_id": row.get("enterprise_id"),
            "lgu_id": row.get("lgu_id"),
            "period": row.get("period"),
            "action_type": row.get("action_type"),
            "message": row.get("message"),
            "triggered_by": row.get("triggered_by"),
            "triggered_at": row.get("triggered_at"),
        }


class AuditLogRepository(SupabaseRepository):
    """Repository for audit log operations."""

    TABLE = "audit_logs"

    def log(
        self,
        entity_type: str,
        entity_id: str,
        action: str,
        actor_id: Optional[str] = None,
        actor_type: Optional[str] = None,
        old_value: Optional[dict] = None,
        new_value: Optional[dict] = None,
    ) -> dict:
        """Create an audit log entry.
        
        Note: PRD_013 simplified schema - removed metadata column.
        """
        client = self._get_client()
        data = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "actor_id": actor_id,
            "actor_type": actor_type,
            "old_value": old_value,
            "new_value": new_value,
            "created_at": self._now_iso(),
        }

        result = client.table(self.TABLE).insert(data).execute()
        if result.data and len(result.data) > 0:
            return result.data[0]
        return data

    def list_by_entity(self, entity_type: str, entity_id: str, limit: int = 100) -> list[dict]:
        """List audit logs for an entity."""
        client = self._get_client()
        result = (
            client.table(self.TABLE)
            .select("*")
            .eq("entity_type", entity_type)
            .eq("entity_id", entity_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data if result.data else []


# Singleton instances for easy import
reporting_window_repo = ReportingWindowRepository()
report_submission_repo = ReportSubmissionRepository()
authority_package_repo = AuthorityPackageRepository()
enterprise_action_repo = EnterpriseActionRepository()
lgu_repo = LguRepository()
lgu_settings_repo = LguSettingsRepository()  # Deprecated, use lgu_repo
system_settings_repo = SystemSettingsRepository()
enterprise_infraction_repo = EnterpriseInfractionRepository()
compliance_action_repo = ComplianceActionRepository()
audit_log_repo = AuditLogRepository()
