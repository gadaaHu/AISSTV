import uuid
import time
import numpy as np
import cv2
import logging
from pathlib import Path
from typing import Optional
from insightface.app import FaceAnalysis

log = logging.getLogger(__name__)


class FaceEngine:
    """
    Face detection + recognition on top of InsightFace/ArcFace.

    - enroll(): add an employee (supports multiple photos, quality-filtered)
    - identify(): given a person crop, return (employee_id, confidence) or (None, score)
    - save()/load(): persist the gallery as a .npz file
    """

    def __init__(
        self,
        model_name: str = "buffalo_l",
        threshold: float = 0.45,
        min_face_px: int = 60,
        use_gpu: bool = True,
    ):
        providers = (
            ["CUDAExecutionProvider", "CPUExecutionProvider"]
            if use_gpu else ["CPUExecutionProvider"]
        )
        self.app = FaceAnalysis(name=model_name, providers=providers)
        self.app.prepare(ctx_id=0 if use_gpu else -1, det_size=(640, 640))

        self.threshold = threshold
        self.min_face_px = min_face_px

        # employee_id -> np.ndarray shape (512,) L2-normalized
        self.gallery: dict[str, np.ndarray] = {}

        # unknown_id -> (np.ndarray shape (512,), last_seen_ts)
        self.unknown_gallery: dict[str, tuple[np.ndarray, float]] = {}
        self.unknown_ttl_seconds: float = 16.0 * 3600.0  # 16-hour suppression window
        log.info("FaceEngine ready (threshold=%.2f, gpu=%s, unknown_window=16h)", threshold, use_gpu)

    # ------------------------------------------------------------------ utils
    @staticmethod
    def _l2norm(v: np.ndarray) -> np.ndarray:
        v = np.asarray(v, dtype=np.float32)
        n = float(np.linalg.norm(v))
        return v / n if n > 0 else v

    def _face_quality_ok(self, face) -> bool:
        """Reject faces that are too small or too blurry for reliable matching."""
        x1, y1, x2, y2 = face.bbox
        w, h = x2 - x1, y2 - y1
        if w < self.min_face_px or h < self.min_face_px:
            return False
        # face detection confidence (InsightFace provides this)
        if getattr(face, "det_score", 1.0) < 0.6:
            return False
        return True

    # ------------------------------------------------------------------ embed
    def _embed_from_bgr(self, img_bgr: np.ndarray):
        """
        Run detection + recognition on a BGR image.
        Returns the embedding of the largest good-quality face, or None.
        """
        if img_bgr is None or img_bgr.size == 0:
            return None

        # InsightFace expects BGR ndarray — good, cv2 already gives us that.
        faces = self.app.get(img_bgr)
        if not faces:
            return None

        faces = [f for f in faces if self._face_quality_ok(f)]
        if not faces:
            return None

        # pick the largest remaining face
        f = max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
        return self._l2norm(f.embedding), f

    # ------------------------------------------------------------------ enroll
    def enroll(self, employee_id: str, images_bgr: list[np.ndarray]) -> bool:
        """
        Enroll from one OR MORE photos. Embeddings are averaged and re-normalized.
        Multiple photos -> much more robust matching.
        Returns True if at least one usable face was found.
        """
        embs = []
        for img in images_bgr:
            res = self._embed_from_bgr(img)
            if res is None:
                log.warning("No usable face in one photo for %s", employee_id)
                continue
            emb, _ = res
            embs.append(emb)

        if not embs:
            log.error("Enrollment failed for %s: no usable faces", employee_id)
            return False

        avg = np.mean(np.stack(embs, axis=0), axis=0)
        self.gallery[employee_id] = self._l2norm(avg)
        log.info("Enrolled %s from %d photo(s)", employee_id, len(embs))
        return True

    # ------------------------------------------------------------------ identify
    def identify_with_unknown(
        self, person_crop_bgr: np.ndarray
    ) -> tuple[Optional[str], float, Optional[str]]:
        """
        Identify a person crop.
        Returns:
            (employee_id, similarity_score, unknown_id)
            - If recognized employee: (employee_id, confidence, None)
            - If unknown face: (None, confidence, unknown_id)
            - If no face found: (None, 0.0, None)
        Unknown faces are clustered and matched using face embeddings within a 16-hour window.
        """
        res = self._embed_from_bgr(person_crop_bgr)
        if res is None:
            return None, 0.0, None
        emb, _ = res

        # 1. Check enrolled employee gallery
        best_id, best_score = None, -1.0
        if self.gallery:
            for eid, g in self.gallery.items():
                s = float(np.dot(emb, g))
                if s > best_score:
                    best_score, best_id = s, eid

        if best_score >= self.threshold and best_id is not None:
            return best_id, best_score, None

        # 2. Unknown face matching with 16-hour memory
        now_ts = time.time()
        cutoff = now_ts - self.unknown_ttl_seconds

        # Prune expired unknown faces older than 16 hours
        expired = [uid for uid, (_, ts) in self.unknown_gallery.items() if ts < cutoff]
        for uid in expired:
            del self.unknown_gallery[uid]

        best_uid = None
        best_u_score = -1.0
        for uid, (u_emb, _) in self.unknown_gallery.items():
            s = float(np.dot(emb, u_emb))
            if s > best_u_score:
                best_u_score, best_uid = s, uid

        if best_u_score >= self.threshold and best_uid is not None:
            # Matched previously seen unknown face within 16-hour window
            self.unknown_gallery[best_uid] = (emb, now_ts)
            return None, max(best_score, 0.0), best_uid
        else:
            # New unknown face seen for the first time
            new_uid = f"unknown_{uuid.uuid4().hex[:8]}"
            self.unknown_gallery[new_uid] = (emb, now_ts)
            return None, max(best_score, 0.0), new_uid

    def identify(self, person_crop_bgr: np.ndarray) -> tuple[Optional[str], float]:
        """
        Identify a person crop (the YOLO box, not just the head).
        Returns (employee_id | None, similarity_score).
        Maintains backward compatibility with callers expecting 2-tuple.
        """
        eid, score, _ = self.identify_with_unknown(person_crop_bgr)
        return eid, score

    # ------------------------------------------------------------------ persist
    def save(self, path: str | Path = "gallery.npz"):
        path = Path(path)
        if not self.gallery:
            log.warning("Refusing to save empty gallery")
            return
        np.savez(path, **self.gallery)
        log.info("Saved %d embeddings to %s", len(self.gallery), path)

    def load(self, path: str | Path = "gallery.npz"):
        path = Path(path)
        try:
            data = np.load(path)
            self.gallery = {k: data[k] for k in data.files}
            log.info("Loaded %d embeddings from %s", len(self.gallery), path)
        except FileNotFoundError:
            log.warning("No gallery file at %s (empty gallery)", path)

    def save_unknowns(self, path: str | Path = "unknowns.npz"):
        """Persist active unknown faces so they are recognized across process restarts."""
        if not self.unknown_gallery:
            return
        try:
            data = {uid: emb for uid, (emb, _) in self.unknown_gallery.items()}
            ts_data = {f"_ts_{uid}": np.array([ts], dtype=np.float64) for uid, (_, ts) in self.unknown_gallery.items()}
            data.update(ts_data)
            np.savez(path, **data)
        except Exception:
            log.exception("Failed to save unknown faces to %s", path)

    def load_unknowns(self, path: str | Path = "unknowns.npz"):
        """Load persistent unknown faces within the 16-hour window."""
        path = Path(path)
        if not path.is_file():
            return
        try:
            data = np.load(path)
            cutoff = time.time() - self.unknown_ttl_seconds
            loaded = 0
            for k in data.files:
                if not k.startswith("_ts_"):
                    ts_arr = data.get(f"_ts_{k}")
                    ts = float(ts_arr[0]) if ts_arr is not None else time.time()
                    if ts >= cutoff:
                        self.unknown_gallery[k] = (data[k], ts)
                        loaded += 1
            log.info("Loaded %d active unknown face(s) from %s", loaded, path)
        except Exception:
            log.exception("Failed to load unknown faces from %s", path)

    # ------------------------------------------------------------------ introspection
    def gallery_size(self) -> int:
        return len(self.gallery)

    def list_employees(self) -> list[str]:
        return sorted(self.gallery.keys())