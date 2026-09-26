import numpy as np
import cv2
import logging
from pathlib import Path
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
        log.info("FaceEngine ready (threshold=%.2f, gpu=%s)", threshold, use_gpu)

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
    def identify(self, person_crop_bgr: np.ndarray):
        """
        Identify a person crop (the YOLO box, not just the head).
        Returns (employee_id | None, similarity_score).
        """
        if not self.gallery:
            return None, 0.0

        res = self._embed_from_bgr(person_crop_bgr)
        if res is None:
            return None, 0.0
        emb, _ = res

        # cosine similarity — gallery vectors are unit length, so dot product = cosine
        best_id, best_score = None, -1.0
        for eid, g in self.gallery.items():
            s = float(np.dot(emb, g))
            if s > best_score:
                best_score, best_id = s, eid

        if best_score < self.threshold:
            return None, best_score
        return best_id, best_score

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

    # ------------------------------------------------------------------ introspection
    def gallery_size(self) -> int:
        return len(self.gallery)

    def list_employees(self) -> list[str]:
        return sorted(self.gallery.keys())