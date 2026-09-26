"""ONVIF client for PTZ, presets, device info. Uses onvif-zeep-async."""
import asyncio
from typing import Optional
from onvif import ONVIFCamera
from .config import settings


class OnvifCameraClient:
    def __init__(self, ip: str, port: int = 80, username: str = "", password: str = ""):
        self.ip = ip
        self.port = port
        self.username = username or ""
        self.password = password or ""
        self._camera: Optional[ONVIFCamera] = None
        self._ptz = None
        self._media = None

    async def connect(self):
        self._camera = ONVIFCamera(
            self.ip, self.port, self.username, self.password,
            no_cache=False,
        )
        await self._camera.update_xaddrs()
        try:
            self._ptz = await self._camera.create_ptz_service()
        except Exception:
            self._ptz = None
        try:
            self._media = await self._camera.create_media_service()
        except Exception:
            self._media = None

    async def device_info(self) -> dict:
        if not self._camera:
            await self.connect()
        devicemgmt = await self._camera.create_devicemgmt_service()
        info = await devicemgmt.GetDeviceInformation()
        return {
            "manufacturer": info.Manufacturer,
            "model": info.Model,
            "firmware": info.FirmwareVersion,
            "serial": info.SerialNumber,
            "hardware": info.HardwareId,
        }

    async def move(self, direction: str, speed: float = 0.5):
        if not self._ptz:
            raise RuntimeError("Camera has no PTZ")
        profiles = await self._media.GetProfiles() if self._media else []
        if not profiles:
            raise RuntimeError("No media profiles")
        token = profiles[0].token

        v = {"x": 0.0, "y": 0.0}
        z = {"x": 0.0}
        d = direction.lower()

        if d == "up":      v["y"] = speed
        elif d == "down":  v["y"] = -speed
        elif d == "left":  v["x"] = -speed
        elif d == "right": v["x"] = speed
        elif d == "zoomin":  z["x"] = speed
        elif d == "zoomout": z["x"] = -speed
        elif d == "stop":    pass
        else:
            raise ValueError(f"Unknown direction: {direction}")

        await self._ptz.ContinuousMove({
            "ProfileToken": token,
            "Velocity": {"PanTilt": v, "Zoom": z},
        })

    async def stop(self):
        if not self._ptz:
            return
        profiles = await self._media.GetProfiles() if self._media else []
        if profiles:
            await self._ptz.Stop({"ProfileToken": profiles[0].token, "PanTilt": True, "Zoom": True})

    async def goto_preset(self, preset_token: str):
        if not self._ptz:
            raise RuntimeError("Camera has no PTZ")
        profiles = await self._media.GetProfiles() if self._media else []
        await self._ptz.GotoPreset({"ProfileToken": profiles[0].token, "PresetToken": preset_token})

    async def list_presets(self) -> list:
        if not self._ptz:
            return []
        profiles = await self._media.GetProfiles() if self._media else []
        if not profiles:
            return []
        result = await self._ptz.GetPresets({"ProfileToken": profiles[0].token})
        return [{"token": p.token, "name": p.Name} for p in (result or [])]

    async def set_preset(self, name: str) -> str:
        if not self._ptz:
            raise RuntimeError("Camera has no PTZ")
        profiles = await self._media.GetProfiles() if self._media else []
        token = await self._ptz.SetPreset({"ProfileToken": profiles[0].token, "PresetName": name})
        return token