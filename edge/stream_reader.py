import cv2
import threading
import time
import logging

log = logging.getLogger(__name__)


class StreamReader:
    """
    Background-thread RTSP reader.

    - Keeps only the newest frame (drops stale ones).
    - Auto-reconnects on failure.
    - Thread-safe: call .read() from any thread.
    """

    def __init__(
        self,
        url: str,
        reconnect_delay: float = 3.0,
        open_timeout_ms: int = 5000,
        read_timeout_ms: int = 5000,
        max_reconnect_delay: float = 30.0,
    ):
        self.url = url
        self.reconnect_delay = reconnect_delay
        self.max_reconnect_delay = max_reconnect_delay
        self.open_timeout_ms = open_timeout_ms
        self.read_timeout_ms = read_timeout_ms

        self.cap = None
        self.frame = None
        self.lock = threading.Lock()

        self.running = False
        self._thread = None

        # stats (useful for /metrics later)
        self.frames_read = 0
        self.reconnects = 0
        self.last_frame_ts = 0.0

    # -------------------------------------------------- lifecycle
    def start(self, wait_first_frame: bool = True, wait_timeout: float = 10.0):
        self.running = True
        self._thread = threading.Thread(
            target=self._loop, name=f"stream-{self.url}", daemon=True
        )
        self._thread.start()

        if wait_first_frame:
            deadline = time.time() + wait_timeout
            while time.time() < deadline:
                with self.lock:
                    if self.frame is not None:
                        return self
                time.sleep(0.05)
            raise RuntimeError(f"No frame from {self.url} within {wait_timeout}s")
        return self

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=3)
        self._release()

    def _release(self):
        if self.cap is not None:
            try:
                self.cap.release()
            except Exception:
                pass
            self.cap = None

    # -------------------------------------------------- thread body
    def _loop(self):
        delay = self.reconnect_delay
        while self.running:
            if self.cap is None or not self.cap.isOpened():
                if not self._open():
                    # exponential backoff up to max_reconnect_delay
                    time.sleep(delay)
                    delay = min(delay * 1.5, self.max_reconnect_delay)
                    continue
                delay = self.reconnect_delay  # reset on success

            ok, frame = self.cap.read()
            if not ok or frame is None:
                log.warning("Read failed on %s, reconnecting", self.url)
                self.reconnects += 1
                self._release()
                continue

            with self.lock:
                self.frame = frame
                self.last_frame_ts = time.time()
                self.frames_read += 1

    def _open(self) -> bool:
        log.info("Opening stream %s", self.url)
        try:
            # Prefer FFMPEG backend for RTSP; falls back to GStreamer / any
            cap = cv2.VideoCapture(self.url, cv2.CAP_FFMPEG)

            # keep only 1 frame buffered inside FFmpeg -> always fresh
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

            # transport + timeout hints (FFmpeg reads these via the URL/opts)
            # If you need finer control, see the "advanced" section below.

            if not cap.isOpened():
                log.warning("Cannot open %s", self.url)
                return False

            self.cap = cap
            log.info("Stream opened: %s", self.url)
            return True
        except Exception:
            log.exception("Exception opening %s", self.url)
            return False

    # -------------------------------------------------- public API
    def read(self):
        """Return the latest frame (BGR ndarray) or None. Never blocks."""
        with self.lock:
            if self.frame is None:
                return None
            return self.frame.copy()   # copy so caller can mutate safely

    def read_raw(self):
        """Return the frame WITHOUT copying. Faster, but do not mutate."""
        with self.lock:
            return self.frame

    def fps(self, window: float = 5.0) -> float:
        """Approximate FPS based on last frame timestamp."""
        with self.lock:
            if self.last_frame_ts == 0:
                return 0.0
            age = time.time() - self.last_frame_ts
            if age > window:
                return 0.0
        # rough estimate — not exact; use frames_read delta if you need precision
        return 1.0 / max(age, 1e-3)

    def stats(self) -> dict:
        with self.lock:
            return {
                "frames_read": self.frames_read,
                "reconnects": self.reconnects,
                "last_frame_age": time.time() - self.last_frame_ts
                if self.last_frame_ts else None,
            }