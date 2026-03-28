from pydantic import BaseModel


class EnterpriseReportSubmission(BaseModel):
    enterprise_id: str
    period: str
    payload: dict | None = None


class EnterpriseActionRequest(BaseModel):
    enterprise_id: str
    message: str | None = None
