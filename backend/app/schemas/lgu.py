from pydantic import BaseModel


class ReportingWindowAction(BaseModel):
    enterprise_id: str
    period: str


class ReportingWindowBulkAction(BaseModel):
    period: str
