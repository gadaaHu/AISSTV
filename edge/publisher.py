import json
import time
import sqlite3
import threading
import logging
from pathlib import Path
from queue import Queue, Empty
from typing import Optional

import paho.mqtt.client as mqtt

log = logging.getLogger(__name__)


class Publisher:
    """
    Reliable MQTT publisher for attendance events.

    - QoS 1 with persistent session (survives broker restart, edge restart).
    - Local SQLite queue: events are enqueued BEFORE publishing.
      Only deleted after the broker acks (PUBACK).
    - Background threads: caller never blocks.
    - Automatic reconnect with exponential backoff.
    """

    def __init__(
        self,
        host: str,
        port: int = 1883,
        topic: str = "attendance/events",
        client_id: str = "edge-01",
        username: Optional[str] = None,
        password: Optional[str] = None,
        queue_db: str = "publish_queue.db",
        keepalive: int = 60,
        tls: bool = False,
        tls_ca: Optional[str] = None,
    ):
        self.host = host
        self.port = port
        self.topic = topic
        self.client_id = client_id
        self.keepalive = keepalive
        self.tls = tls
        self.tls_ca = tls_ca

        # --- persistent queue ---
        self.db_path = Path(queue_db)
        self._db_lock = threading.Lock()
        self._init_db()

        # --- internal work queue (in-memory, disk is source of truth) ---
        self._q: Queue = Queue()
        self._stop = threading.Event()
        self._connected = threading.Event()

        # --- MQTT client ---
        self.client = mqtt.Client(
            client_id=self.client_id,
            clean_session=False,               # persistent session
            protocol=mqtt.MQTTv5,
        )
        if username:
            self.client.username_pw_set(username, password)
        if tls:
            self.client.tls_set(ca_certs=tls_ca) if tls_ca else self.client.tls_set()

        # last-will: if the edge dies, the broker publishes this so the
        # backend knows the camera stopped reporting
        self.client.will_set(
            topic=f"{self.topic.rsplit('/', 1)[0]}/status",
            payload=json.dumps({"client_id": self.client_id, "state": "offline"}),
            qos=1, retain=True,
        )

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_publish = self._on_publish

        # --- threads ---
        self._net_thread: Optional[threading.Thread] = None
        self._pub_thread: Optional[threading.Thread] = None
        self._retry_thread: Optional[threading.Thread] = None

        # stats
        self.published = 0
        self.failed = 0
        self.queued_on_disk = 0

    # ---------------------------------------------------------------- db
    def _init_db(self):
        with self._db_lock:
            con = sqlite3.connect(self.db_path)
            con.execute("""
                CREATE TABLE IF NOT EXISTS outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT UNIQUE,
                    payload TEXT NOT NULL,
                    topic TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    attempts INTEGER DEFAULT 0
                )
            """)
            con.execute("CREATE INDEX IF NOT EXISTS ix_outbox_created ON outbox(created_at)")
            con.commit()
            con.close()

    def _db_enqueue(self, event: dict):
        with self._db_lock:
            con = sqlite3.connect(self.db_path)
            con.execute(
                "INSERT OR IGNORE INTO outbox(event_id, payload, topic, created_at) "
                "VALUES (?, ?, ?, ?)",
                (event.get("event_id"), json.dumps(event), self.topic, time.time()),
            )
            con.commit()
            self.queued_on_disk = con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
            con.close()

    def _db_delete(self, event_id: str):
        with self._db_lock:
            con = sqlite3.connect(self.db_path)
            con.execute("DELETE FROM outbox WHERE event_id = ?", (event_id,))
            con.commit()
            self.queued_on_disk = con.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]
            con.close()

    def _db_load_pending(self, limit: int = 500) -> list[tuple]:
        with self._db_lock:
            con = sqlite3.connect(self.db_path)
            rows = con.execute(
                "SELECT event_id, payload, topic FROM outbox "
                "ORDER BY created_at LIMIT ?", (limit,)
            ).fetchall()
            con.close()
        return rows

    # ---------------------------------------------------------------- mqtt callbacks
    def _on_connect(self, client, userdata, flags, rc, props=None):
        if rc == 0:
            self._connected.set()
            log.info("MQTT connected to %s:%d as %s", self.host, self.port, self.client_id)
            # publish online status (retained)
            client.publish(
                f"{self.topic.rsplit('/', 1)[0]}/status",
                json.dumps({"client_id": self.client_id, "state": "online"}),
                qos=1, retain=True,
            )
        else:
            self._connected.clear()
            log.warning("MQTT connect failed rc=%s", rc)

    def _on_disconnect(self, client, userdata, rc, props=None):
        self._connected.clear()
        log.warning("MQTT disconnected rc=%s", rc)

    def _on_publish(self, client, userdata, mid, rc=None, props=None):
        # MQTTv5 passes a reason code; paho stores per-mid payload user data
        ud = getattr(userdata, "get", lambda *_: None)
        # paho does not give us the payload here; we use a side table instead
        pass  # handled in _pub_loop via wait_for_publish()

    # ---------------------------------------------------------------- lifecycle
    def start(self) -> "Publisher":
        # Reconnect and network loops
        self.client.connect_async(self.host, self.port, keepalive=self.keepalive)
        self._net_thread = threading.Thread(
            target=self.client.loop_forever, name="mqtt-net", daemon=True
        )
        self._net_thread.start()

        # Load any pending events from disk into the in-memory queue
        for event_id, payload, topic in self._db_load_pending():
            self._q.put((event_id, payload, topic))

        # Publisher worker
        self._pub_thread = threading.Thread(
            target=self._pub_loop, name="mqtt-pub", daemon=True
        )
        self._pub_thread.start()

        # Background retry — periodically re-load pending disk events
        self._retry_thread = threading.Thread(
            target=self._retry_loop, name="mqtt-retry", daemon=True
        )
        self._retry_thread.start()

        log.info("Publisher started (topic=%s, queue=%s)", self.topic, self.db_path)
        return self

    def stop(self, drain_timeout: float = 5.0):
        log.info("Publisher stopping...")
        self._stop.set()
        # let the worker drain briefly
        deadline = time.time() + drain_timeout
        while not self._q.empty() and time.time() < deadline:
            time.sleep(0.1)
        self.client.disconnect()
        if self._net_thread:
            self._net_thread.join(timeout=2)
        log.info("Publisher stopped (published=%d failed=%d pending=%d)",
                 self.published, self.failed, self.queued_on_disk)

    # ---------------------------------------------------------------- public API
    def publish(self, event: dict) -> None:
        """
        Non-blocking. Enqueues to disk and wakes the worker.
        Safe to call from any thread at any rate.
        """
        self._db_enqueue(event)
        self._q.put((event.get("event_id"), json.dumps(event), self.topic))

    def stats(self) -> dict:
        return {
            "connected": self._connected.is_set(),
            "in_memory_queue": self._q.qsize(),
            "on_disk": self.queued_on_disk,
            "published": self.published,
            "failed": self.failed,
        }

    # ---------------------------------------------------------------- worker loops
    def _pub_loop(self):
        while not self._stop.is_set():
            try:
                event_id, payload, topic = self._q.get(timeout=1.0)
            except Empty:
                continue

            # wait for connection (with timeout) — don't drop the event
            if not self._connected.wait(timeout=30):
                log.warning("Broker unavailable, holding %d events", self._q.qsize() + 1)
                self._q.put((event_id, payload, topic))
                time.sleep(2)
                continue

            info = self.client.publish(topic, payload, qos=1, retain=False)

            # wait up to 5s for PUBACK; if no ack, re-queue and try later
            try:
                info.wait_for_publish(timeout=5)
                if info.rc == mqtt.MQTT_ERR_SUCCESS:
                    self._db_delete(event_id)
                    self.published += 1
                    log.debug("PUB %s", event_id)
                else:
                    self.failed += 1
                    log.warning("Publish rc=%s, will retry", info.rc)
                    self._q.put((event_id, payload, topic))
                    time.sleep(1)
            except (ValueError, RuntimeError) as e:
                self.failed += 1
                log.warning("Publish wait failed: %s, will retry", e)
                self._q.put((event_id, payload, topic))
                time.sleep(1)

    def _retry_loop(self):
        """Periodically scan the disk outbox for events not yet in the work queue."""
        while not self._stop.is_set():
            time.sleep(30)
            try:
                # Only if the in-memory queue is nearly empty (avoid dup work)
                if self._q.qsize() > 10:
                    continue
                for event_id, payload, topic in self._db_load_pending(limit=100):
                    self._q.put((event_id, payload, topic))
            except Exception:
                log.exception("Retry loop error")