import asyncio
import json
from typing import Any
import paho.mqtt.client as mqtt
from .logging_conf import get_logger

log = get_logger(__name__)


class AlertManager:
    def __init__(self) -> None:
        self._subscribers: dict = {}
        self._lock = asyncio.Lock()
        self._mqtt = None

    async def subscribe(self, client_id: str) -> asyncio.Queue:
        async with self._lock:
            q: asyncio.Queue = asyncio.Queue(maxsize=100)
            self._subscribers[client_id] = q
            return q

    async def unsubscribe(self, client_id: str) -> None:
        async with self._lock:
            self._subscribers.pop(client_id, None)

    async def broadcast(self, payload: dict) -> None:
        for cid, q in list(self._subscribers.items()):
            try:
                q.put_nowait(payload)
            except asyncio.QueueFull:
                await self.unsubscribe(cid)

    def attach_mqtt(self, client) -> None:
        self._mqtt = client

    def publish_mqtt(self, payload: dict, topic: str = "attendance/alerts/fraud") -> None:
        if self._mqtt is None:
            return
        try:
            self._mqtt.publish(topic, json.dumps(payload, default=str), qos=1)
        except Exception:
            log.exception("mqtt_publish_failed")


alert_manager = AlertManager()
