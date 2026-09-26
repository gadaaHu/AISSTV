from typing import Generic, TypeVar
from pydantic import BaseModel

T = TypeVar("T")

class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int

class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class ChangePasswordIn(BaseModel):
    old_password: str
    new_password: str

class ConsumerStats(BaseModel):
    uptime_sec: int
    received: int
    inserted: int
    duplicates: int
    invalid: int
    errors: int
    attendance_created: int
    attendance_updated: int
    unknown_employees: int
