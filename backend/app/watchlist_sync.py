import json
import logging
import paho.mqtt.client as mqtt
from .config import settings

log = logging.getLogger(__name__)
_client = None
TOPIC = "attendance/commands/watchlist"


def init_watchlist_publisher() -> None:
    global _client
    try:
        _client = mqtt.Client(client_id="watchlist-sync-publisher", protocol=mqtt.MQTTv5)
        _client.connect_async(settings.mqtt_host, settings.mqtt_port, 60)
        _client.loop_start()
    except Exception:
        log.exception("watchlist_publisher_init_failed")


def stop_watchlist_publisher() -> None:
    if _client:
        try:
            _client.loop_stop()
            _client.disconnect()
        except Exception:
            pass


def push_watchlist_add(code: str, embeddings_b64: list) -> None:
    if _client is None:
        return
    _client.publish(TOPIC, json.dumps({"cmd": "add", "code": code, "embeddings": embeddings_b64}), qos=1)


def push_watchlist_remove(code: str) -> None:
    if _client is None:
        return
    _client.publish(TOPIC, json.dumps({"cmd": "remove", "code": code}), qos=1)
