from functools import lru_cache
from typing import Literal

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", case_sensitive=False,
    )

    app_name: str = "Smart Attendance API"
    env: Literal["dev", "staging", "prod"] = "dev"
    debug: bool = False
    log_level: str = "INFO"
    log_json: bool = False

    database_url: str = "postgresql+asyncpg://app:app@postgres:5432/attendance"
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_pre_ping: bool = True
    db_echo: bool = False

    mqtt_host: str = "mosquitto"
    mqtt_port: int = 1883
    mqtt_topic: str = "attendance/+/+/+/events"
    mqtt_client_id: str = "backend-consumer"
    mqtt_username: str | None = None
    mqtt_password: SecretStr | None = None
    mqtt_qos: int = 1

    jwt_secret: SecretStr = SecretStr("change-me-in-prod")
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    bcrypt_rounds: int = 12
    bootstrap_admin_user: str = "admin"
    bootstrap_admin_password: SecretStr = SecretStr("admin123")

    cors_origins: list = ["http://localhost:3000", "http://localhost:4000"]
    evidence_dir: str = "/var/lib/attendance/evidence"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
