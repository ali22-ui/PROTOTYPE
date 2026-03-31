from pydantic import BaseModel
from typing import Optional


class EnterpriseReportSubmission(BaseModel):
    enterprise_id: str
    period: str
    payload: dict | None = None


class EnterpriseActionRequest(BaseModel):
    enterprise_id: str
    message: str | None = None


class EnterpriseAccountSettings(BaseModel):
    company_name: Optional[str] = None
    business_type: Optional[str] = None
    address: Optional[str] = None
    contact_email: Optional[str] = None
    contact_phone: Optional[str] = None


class EnterpriseProfileUpdate(BaseModel):
    business_permit_number: Optional[str] = None
    owner_name: Optional[str] = None
    owner_contact: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    settings: Optional[dict] = None


class EnterprisePasswordChange(BaseModel):
    current_password: str
    new_password: str


class EnterprisePreferencesUpdate(BaseModel):
    preferences: dict
