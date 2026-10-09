"""
Edge vision pipeline.

Wires StreamReader → YOLO+ByteTrack → FaceEngine → RulesEngine → Publisher.

Run:
    python main.py                     # uses config.yaml in cwd
    python main.py --config /etc/attendance/cam-01.yaml
"""
import argparse
import logging
import signal
import sys
import time
from pathlib import Path

import cv2
import yaml

from ultralytics import YOLO

from stream_reader import StreamReader
from face_engine import FaceEngine
from rules_engine import RulesEngine
from publisher import Publisher


# ------------------------------------------------------------------ logging
def setup_logging(level: str = "INFO", logfile: str | None = None):
    handlers = [logging.StreamHandler(sys.stdout)]
    if logfile:
        Path(logfile).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(logging.FileHandler(logfile))
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)-5s %(name)-12s %(message)s",
        handlers=handlers,
    )

log = logging.getLogger("edge")


# ------------------------------------------------------------------ config
def load_config(path: str) -> dict:
    with open(path) as f:
        cfg = yaml.safe_load(f)

    # minimal validation
    required = [
        ("camera", "id"), ("camera", "url"), ("camera", "zone"),
        ("detector", "model"),
        ("face", "model"), ("face", "threshold"), ("face", "min_box"),
        ("attendance", "shift_start"),
        ("mqtt", "host"), ("mqtt", "port"), ("mqtt", "topic"),
    ]
    for section, key in required:
        if section not in cfg or key not in cfg[section]:
            raise ValueError(f"config.yaml missing {section}.{key}")
    return cfg


# ------------------------------------------------------------------ shutdown
class Shutdown:
    def __init__(self):
        self.flag = False
        signal.signal(signal.SIGINT, self._handler)
        signal.signal(signal.SIGTERM, self._handler)

    def _handler(self, *_):
        if not self.flag:
            log.info("Shutdown requested (Ctrl+C or SIGTERM)")
        self.flag = True


# ------------------------------------------------------------------ stats
class Stats:
    def __init__(self):
        self.frames = 0
        self.detections = 0
        self.face_calls = 0
        self.face_hits = 0
        self.events_emitted = 0
        self.errors = 0
        self.started = time.time()

    def snapshot(self, rules, pub, face_cache_size):
        uptime = time.time() - self.started
        return {
            "uptime_sec": int(uptime),
            "frames": self.frames,
            "fps_avg": round(self.frames / max(uptime, 1), 2),
            "detections": self.detections,
            "face_calls": self.face_calls,
            "face_hit_rate": round(self.face_hits / max(self.face_calls, 1), 3),
            "face_cache": face_cache_size,
            "events": self.events_emitted,
            "errors": self.errors,
            "tracks_active": len(rules.states),
            "mqtt": pub.stats(),
        }


# ------------------------------------------------------------------ main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config.yaml")
    args = ap.parse_args()

    cfg = load_config(args.config)
    setup_logging(cfg.get("log", {}).get("level", "INFO"),
                  cfg.get("log", {}).get("file"))

    log.info("Starting edge node camera=%s zone=%s",
             cfg["camera"]["id"], cfg["camera"]["zone"])

    shutdown = Shutdown()

    # --- 1. publisher (start first so we can emit errors during init) ---
    pub = Publisher(
        host=cfg["mqtt"]["host"],
        port=cfg["mqtt"]["port"],
        topic=cfg["mqtt"]["topic"],
        client_id=f"edge-{cfg['camera']['id']}",
        username=cfg["mqtt"].get("username"),
        password=cfg["mqtt"].get("password"),
        queue_db=f"queue-{cfg['camera']['id']}.db",
    ).start()

    # --- 2. stream reader ---
    try:
        reader = StreamReader(cfg["camera"]["url"]).start(wait_timeout=15)
    except Exception as e:
        log.exception("Failed to open camera stream")
        pub.publish({
            "event_id": f"boot-{int(time.time())}",
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "type": "EDGE_ERROR", "camera_id": cfg["camera"]["id"],
            "zone": cfg["camera"]["zone"], "employee_id": None,
            "confidence": 0.0, "track_id": None,
            "meta": {"stage": "stream_init", "error": str(e)},
        })
        pub.stop(drain_timeout=3)
        sys.exit(2)

    # --- 3. detector ---
    log.info("Loading detector %s", cfg["detector"]["model"])
    model = YOLO(cfg["detector"]["model"])

    # --- 4. face engine ---
    log.info("Loading face engine %s", cfg["face"]["model"])
    face = FaceEngine(
        model_name=cfg["face"]["model"],
        threshold=cfg["face"]["threshold"],
        min_face_px=cfg["face"]["min_box"],
        use_gpu=cfg.get("face", {}).get("use_gpu", True),
    )
    face.load(cfg.get("face", {}).get("gallery", "gallery.npz"))
    if face.gallery_size() == 0:
        log.warning("Gallery is empty — every face will be UNKNOWN")
    else:
        log.info("Gallery has %d employee(s)", face.gallery_size())

    # --- 5. rules engine ---
    rules = RulesEngine(
        camera_id=cfg["camera"]["id"],
        zone=cfg["camera"]["zone"],
        shift_start=cfg["attendance"]["shift_start"],
        grace_minutes=cfg["attendance"].get("grace_minutes", 15),
        exit_timeout_sec=cfg["attendance"].get("exit_timeout_sec", 20),
        min_frames_for_enter=cfg["attendance"].get("min_frames_for_enter", 3),
        min_confidence_for_enter=cfg["attendance"].get("min_confidence_for_enter", 0.45),
        unknown_alert_sec=cfg["attendance"].get("unknown_alert_sec", 5),
        timezone_name=cfg["attendance"].get("timezone", "Africa/Addis_Ababa"),
        debounce_hours=float(cfg["attendance"].get("cooldown_hours", cfg["attendance"].get("debounce_hours", 16.0))),
        db_path=f"cooldown-{cfg['camera']['id']}.db",
    )

    # --- announce online ---
    pub.publish({
        "event_id": f"boot-{int(time.time())}",
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "type": "EDGE_ONLINE",
        "camera_id": cfg["camera"]["id"],
        "zone": cfg["camera"]["zone"],
        "employee_id": None, "confidence": 0.0, "track_id": None,
        "meta": {
            "gallery_size": face.gallery_size(),
            "model_detector": cfg["detector"]["model"],
            "model_face": cfg["face"]["model"],
            "host_version": "1.0",
        },
    })

    # --- runtime config ---
    fps_process = float(cfg["camera"].get("fps_process", 5))
    frame_interval = 1.0 / fps_process
    conf_thres = float(cfg["detector"].get("conf", 0.45))
    imgsz = int(cfg["detector"].get("imgsz", 640))
    tracker_cfg = cfg["detector"].get("tracker", "bytetrack.yaml")

    face_cache_ttl = float(cfg["face"].get("cache_ttl_sec", 5.0))
    face_cache: dict[int, tuple[str | None, float, float]] = {}

    save_snapshots = bool(cfg.get("storage", {}).get("save_snapshots", False))
    snapshot_dir = Path(cfg.get("storage", {}).get("dir", "snapshots"))
    if save_snapshots:
        snapshot_dir.mkdir(parents=True, exist_ok=True)

    stats = Stats()
    last_sweep = time.time()
    last_heartbeat = time.time()
    last_stats_log = time.time()
    last_stats_reset = time.time()
    last_frame_ts = 0.0

    log.info("Pipeline running (fps_process=%.1f, conf=%.2f, imgsz=%d)",
             fps_process, conf_thres, imgsz)

    # ------------------------------------------------------------------ loop
    try:
        while not shutdown.flag:
            loop_t0 = time.time()

            # ---- 1. grab newest frame ----
            frame = reader.read()
            if frame is None:
                time.sleep(0.05)
                continue

            frame_ts = reader.last_frame_ts
            if frame_ts == last_frame_ts:
                # no new frame arrived since last loop — skip
                time.sleep(0.005)
                continue
            last_frame_ts = frame_ts
            stats.frames += 1

            # ---- 2. detect + track ----
            try:
                results = model.track(
                    frame, persist=True,
                    classes=[0],                # person class only
                    conf=conf_thres,
                    imgsz=imgsz,
                    tracker=tracker_cfg,
                    verbose=False,
                )
            except Exception:
                stats.errors += 1
                log.exception("Detector error")
                time.sleep(0.5)
                continue

            events = []
            r = results[0] if results else None
            if r is not None and r.boxes is not None and r.boxes.id is not None:
                boxes = r.boxes.xyxy.cpu().numpy()
                ids = r.boxes.id.cpu().numpy().astype(int)
                stats.detections += len(ids)

                for box, tid in zip(boxes, ids):
                    x1, y1, x2, y2 = map(int, box)

                    # ---- 3a. face cache check ----
                    now = time.time()
                    cached = face_cache.get(tid)
                    if cached and (now - cached[3]) < face_cache_ttl:
                        eid, conf, unknown_id = cached[0], cached[1], cached[2]
                    else:
                        # ---- 3b. crop and identify ----
                        crop = frame[max(0, y1):y2, max(0, x1):x2]
                        if crop.size == 0:
                            continue
                        try:
                            eid, conf, unknown_id = face.identify_with_unknown(crop)
                            stats.face_calls += 1
                            if eid:
                                stats.face_hits += 1
                        except Exception:
                            stats.errors += 1
                            log.exception("Face identify error")
                            eid, conf, unknown_id = None, 0.0, None
                        face_cache[tid] = (eid, conf, unknown_id, now)

                    # ---- 4. rules ----
                    events += rules.update(tid, eid, conf, unknown_id=unknown_id)

            # ---- 5. sweep (1 Hz) ----
            if time.time() - last_sweep > 1.0:
                events += rules.sweep()
                # prune dead tracks from face cache
                dead = [t for t in face_cache if t not in rules.states]
                for t in dead:
                    face_cache.pop(t, None)
                last_sweep = time.time()

            # ---- 6. snapshots + publish ----
            for ev in events:
                if save_snapshots and ev.get("track_id") is not None:
                    path = snapshot_dir / f"{ev['event_id']}.jpg"
                    try:
                        cv2.imwrite(str(path), frame)
                        ev["snapshot_path"] = str(path)
                    except Exception:
                        log.exception("Snapshot save failed")
                pub.publish(ev)
                stats.events_emitted += 1

            # ---- 7. heartbeat (every 30s) ----
            if time.time() - last_heartbeat > 30:
                pub.publish({
                    "event_id": f"hb-{int(time.time())}",
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "type": "EDGE_HEARTBEAT",
                    "camera_id": cfg["camera"]["id"],
                    "zone": cfg["camera"]["zone"],
                    "employee_id": None, "confidence": 0.0, "track_id": None,
                    "meta": stats.snapshot(rules, pub, len(face_cache)),
                })
                last_heartbeat = time.time()

            # ---- 8. periodic stats log (every 60s) ----
            if time.time() - last_stats_log > 60:
                snap = stats.snapshot(rules, pub, len(face_cache))
                log.info(
                    "stats fps=%.1f det=%d face=%d hit=%.2f events=%d err=%d tracks=%d q=%d",
                    snap["fps_avg"], snap["detections"], snap["face_calls"],
                    snap["face_hit_rate"], snap["events"], snap["errors"],
                    snap["tracks_active"], snap["mqtt"]["in_memory_queue"],
                )
                last_stats_log = time.time()

            # ---- 9. frame pacing ----
            elapsed = time.time() - loop_t0
            if elapsed < frame_interval:
                time.sleep(frame_interval - elapsed)

    except Exception:
        log.exception("Fatal error in main loop")
        pub.publish({
            "event_id": f"crash-{int(time.time())}",
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "type": "EDGE_ERROR",
            "camera_id": cfg["camera"]["id"],
            "zone": cfg["camera"]["zone"],
            "employee_id": None, "confidence": 0.0, "track_id": None,
            "meta": {"stage": "main_loop"},
        })
        raise

    finally:
        log.info("Shutting down...")
        try:
            reader.stop()
        except Exception:
            pass
        # flush pending events
        try:
            final_events = rules.sweep()
            for ev in final_events:
                pub.publish(ev)
        except Exception:
            pass
        pub.publish({
            "event_id": f"shutdown-{int(time.time())}",
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            "type": "EDGE_OFFLINE",
            "camera_id": cfg["camera"]["id"],
            "zone": cfg["camera"]["zone"],
            "employee_id": None, "confidence": 0.0, "track_id": None,
            "meta": stats.snapshot(rules, pub, len(face_cache)),
        })
        pub.stop(drain_timeout=10)
        log.info("Stopped.")


if __name__ == "__main__":
    main()