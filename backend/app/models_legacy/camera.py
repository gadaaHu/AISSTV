from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

class Camera(Base):
    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    zone: Mapped[str] = mapped_column(String(100))
    site: Mapped[Optional[str]] = mapped_column(String(100))
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), index=True)
    last_state: Mapped[Optional[str]] = mapped_column(String(20))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
