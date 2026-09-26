"""Identify faces in a photo or webcam frame. Press q to quit."""
import sys, cv2, yaml, logging
from face_engine import FaceEngine

logging.basicConfig(level=logging.INFO)

cfg = yaml.safe_load(open("config.yaml"))
eng = FaceEngine(
    model_name=cfg["face"]["model"],
    threshold=cfg["face"]["threshold"],
    min_face_px=cfg["face"]["min_box"],
)
eng.load("gallery.npz")
print("Gallery:", eng.list_employees())


def annotate(img, box, label, score, color):
    x1, y1, x2, y2 = map(int, box)
    cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
    text = f"{label} {score:.2f}" if label else f"unknown {score:.2f}"
    cv2.putText(img, text, (x1, max(20, y1 - 8)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)


def run_on_image(path):
    img = cv2.imread(path)
    if img is None:
        print("Cannot read", path); return
    faces = eng.app.get(img)
    print(f"{len(faces)} face(s) detected")
    for f in faces:
        # crop the face box and run identify()
        x1, y1, x2, y2 = map(int, f.bbox)
        crop = img[y1:y2, x1:x2]
        eid, score = eng.identify(crop)
        print(f"  -> {eid or 'unknown'}  sim={score:.3f}")
        annotate(img, f.bbox, eid, score,
                 (0, 255, 0) if eid else (0, 0, 255))
    cv2.imshow("identify", img)
    cv2.waitKey(0)
    cv2.destroyAllWindows()


def run_on_webcam(cam_index=0):
    cap = cv2.VideoCapture(cam_index)
    while True:
        ok, frame = cap.read()
        if not ok: break
        for f in eng.app.get(frame):
            x1, y1, x2, y2 = map(int, f.bbox)
            eid, score = eng.identify(frame[y1:y2, x1:x2])
            annotate(frame, f.bbox, eid, score,
                     (0, 255, 0) if eid else (0, 0, 255))
        cv2.imshow("identify", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"): break
    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] != "webcam":
        run_on_image(sys.argv[1])
    else:
        run_on_webcam()