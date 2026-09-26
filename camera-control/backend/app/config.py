from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "SSTV Camera Control"
    env: str = "dev"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://app:app@postgres:5432/attendance"
    mqtt_host: str = "mosquitto"
    mqtt_port: int = 1883

    hls_output_dir: str = "/var/lib/camera-control/hls"
    recordings_dir: str = "/var/lib/camera-control/recordings"
    snapshots_dir: str = "/var/lib/camera-control/snapshots"

    default_rtsp_transport: str = "tcp"
    onvif_timeout_seconds: int = 10

    cors_origins: list = ["http://localhost:3100"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()