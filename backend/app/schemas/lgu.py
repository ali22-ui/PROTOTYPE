from pydantic import BaseModel
from typing import Optional


class ReportingWindowAction(BaseModel):
    enterprise_id: str
    period: str
    status: Optional[str] = None
    message: Optional[str] = None


class ReportingWindowBulkAction(BaseModel):
    period: str
    status: Optional[str] = None
    message: Optional[str] = None


class LguSettingsUpdate(BaseModel):
    setting_key: str
    setting_value: str | int | bool | dict | list


class EnterpriseComplianceAction(BaseModel):
    enterprise_id: str
    period: str
    action_type: str  # OPEN, REMIND, WARN, RENOTIFY, CLOSE
    message: Optional[str] = None


class EnterpriseInfractionCreate(BaseModel):
    enterprise_id: str
    period: str
    infraction_type: str
    severity: str = "warning"
    source: str = "LGU_COMPLIANCE_ACTION"
    note: Optional[str] = None


class LguEnterpriseAccountCreate(BaseModel):
    enterprise_id: str
    company_name: str
    linked_lgu_id: str
    username: str
    temporary_password: str
    barangay: str
    contact_email: str


class LguEnterpriseAccountUpdate(BaseModel):
    company_name: Optional[str] = None
    linked_lgu_id: Optional[str] = None
    username: Optional[str] = None
    temporary_password: Optional[str] = None
    barangay: Optional[str] = None
    contact_email: Optional[str] = None
