"""
Enroll one employee from live camera or photo files.

Usage:
    # Live camera enrollment (from webcam or RTSP stream):
    python enroll.py --live emp-001 "Abebe Kebede"
    python enroll.py --live emp-001 "Abebe Kebede" --camera 0 --samples 5

    # Static photo enrollment:
    python enroll.py emp-001 "Abebe Kebede" photo1.jpg photo2.jpg photo3.jpg
    python enroll.py emp-002 "Sara Lemma"  sara_*.jpg

    # Gallery management:
    python enroll.py --list
    python enroll.py --remove emp-001
"""
import sys
import time
import glob
import argparse
import yaml
import cv2
import logging
from pathlib import Path
from face_engine import FaceEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def expand(paths):
    out = []
    for p in paths:
        hits = glob.glob(p)
        out.extend(hits if hits else [p])
    return out


def enroll_live(eng, emp_id: str, name: str, cam_source=None, target_samples: int = 5, save_dir: str = "photos") -> bool:
    Path(save_dir).mkdir(parents=True, exist_ok=True)
    if cam_source is None:
        cfg = yaml.safe_load(open("config.yaml"))
        cam_source = cfg.get("camera", {}).get("url", 0)

    if isinstance(cam_source, str) and cam_source.isdigit():
        cam_source = int(cam_source)

    cap = cv2.VideoCapture(cam_source)
    if not cap.isOpened():
        print(f"Error: Could not open camera source '{cam_source}'. Check camera connection or config.yaml.")
        return False

    print("=" * 65)
    print(f"LIVE FACE ENROLLMENT: {emp_id} ({name})")
    print(f"Camera Source : {cam_source}")
    print(f"Target Samples: {target_samples} clear face frames")
    print("Instructions  : Face the camera directly. Turn slightly left & right.")
    print("Controls      : [SPACE] = Snap sample | Auto-captures when green | [Q] = Cancel")
    print("=" * 65)

    samples = []
    last_auto_capture_time = 0.0
    has_display = True

    try:
        while len(samples) < target_samples:
            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.05)
                continue

            faces = eng.app.get(frame)
            good_face = None
            guidance = "No face detected"
            color = (0, 0, 255)  # Red

            if faces:
                f = max(faces, key=lambda x: (x.bbox[2] - x.bbox[0]) * (x.bbox[3] - x.bbox[1]))
                x1, y1, x2, y2 = map(int, f.bbox)
                w, h = x2 - x1, y2 - y1
                det_score = getattr(f, "det_score", 1.0)

                if w < eng.min_face_px or h < eng.min_face_px:
                    guidance = "Move closer (face too small)"
                    color = (0, 165, 255)  # Orange
                elif det_score < 0.6:
                    guidance = "Look directly at camera"
                    color = (0, 255, 255)  # Yellow
                else:
                    guidance = "Good face quality"
                    color = (0, 255, 0)  # Green
                    good_face = f

            now = time.time()
            trigger_capture = False

            if has_display:
                display_frame = frame.copy()
                if faces:
                    x1, y1, x2, y2 = map(int, f.bbox)
                    cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(
                        display_frame, f"{guidance} ({w}x{h})", (x1, max(25, y1 - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
                    )

                # Header banner
                cv2.rectangle(display_frame, (0, 0), (display_frame.shape[1], 42), (20, 20, 20), -1)
                status_txt = f"Enrolling: {name} ({emp_id}) | Samples: {len(samples)}/{target_samples} | [SPACE] Snap, [Q] Exit"
                cv2.putText(
                    display_frame, status_txt, (15, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2,
                )

                try:
                    cv2.imshow("Live Face Enrollment", display_frame)
                    key = cv2.waitKey(1) & 0xFF
                    if key in (ord('q'), ord('Q'), 27):
                        print("\nEnrollment cancelled by user.")
                        break
                    elif key == 32:  # SPACE
                        if good_face is not None:
                            trigger_capture = True
                        else:
                            print("  ! Cannot snap: No good face in frame")
                except cv2.error:
                    has_display = False

            # Auto-capture every 1.2s when face is green/good
            if good_face is not None and (now - last_auto_capture_time >= 1.2) and not trigger_capture:
                trigger_capture = True

            if trigger_capture and good_face is not None:
                samples.append(frame.copy())
                last_auto_capture_time = now
                print(f"  + Captured sample {len(samples)}/{target_samples} ({w}x{h}, conf={det_score:.2f})")
                time.sleep(0.3)

    finally:
        cap.release()
        if has_display:
            try:
                cv2.destroyAllWindows()
            except Exception:
                pass

    if not samples:
        print("No samples captured. Enrollment cancelled.")
        return False

    saved_paths = []
    for i, s in enumerate(samples, 1):
        sample_path = Path(save_dir) / f"{emp_id}_live_{i}.jpg"
        cv2.imwrite(str(sample_path), s)
        saved_paths.append(str(sample_path))

    ok = eng.enroll(emp_id, samples)
    if not ok:
        print("Enrollment failed: Unable to extract valid face embeddings.")
        return False

    eng.save("gallery.npz")
    print(f"\n[SUCCESS] Enrolled '{emp_id}' ({name}) from {len(samples)} live camera samples!")
    print(f"Saved sample photos to: {', '.join(saved_paths)}")
    print(f"Gallery now has {eng.gallery_size()} employee(s) in gallery.npz.")
    return True


def main():
    cfg = yaml.safe_load(open("config.yaml"))
    eng = FaceEngine(
        model_name=cfg["face"]["model"],
        threshold=cfg["face"]["threshold"],
        min_face_px=cfg["face"]["min_box"],
    )
    eng.load("gallery.npz")

    # ---------- list ----------
    if len(sys.argv) >= 2 and sys.argv[1] == "--list":
        emps = eng.list_employees()
        print(f"{len(emps)} enrolled employee(s):")
        for e in emps:
            print(" -", e)
        return

    # ---------- remove ----------
    if len(sys.argv) >= 3 and sys.argv[1] == "--remove":
        emp_id = sys.argv[2]
        if emp_id in eng.gallery:
            del eng.gallery[emp_id]
            eng.save("gallery.npz")
            print(f"Removed {emp_id}")
        else:
            print(f"Not found: {emp_id}")
        return

    # ---------- sync directory enrollment ----------
    if len(sys.argv) >= 2 and sys.argv[1] == "--sync-dir":
        sync_dir = sys.argv[2] if len(sys.argv) > 2 else "photos"
        p = Path(sync_dir)
        if not p.exists():
            print(f"Directory not found: {sync_dir}")
            sys.exit(1)

        from collections import defaultdict
        grouped = defaultdict(list)
        for f in p.glob("*.*"):
            if f.suffix.lower() in (".jpg", ".jpeg", ".png"):
                parts = f.stem.split("_")
                emp_id = parts[0]
                grouped[emp_id].append(f)

        print(f"Found {len(grouped)} employee(s) in {sync_dir}:")
        success_count = 0
        for emp_id, files in grouped.items():
            imgs = [cv2.imread(str(x)) for x in files]
            imgs = [x for x in imgs if x is not None]
            if not imgs:
                continue
            if eng.enroll(emp_id, imgs):
                print(f"  + Enrolled {emp_id} ({len(imgs)} photo(s))")
                success_count += 1
            else:
                print(f"  ! Failed {emp_id}: No valid face detected")

        if success_count > 0:
            eng.save("gallery.npz")
            print(f"\nSuccessfully synced {success_count} employee(s). Gallery has {eng.gallery_size()} faces.")
        return

    # ---------- live enrollment ----------
    if len(sys.argv) >= 2 and sys.argv[1] == "--live":
        parser = argparse.ArgumentParser(description="Live camera face enrollment")
        parser.add_argument("--live", action="store_true")
        parser.add_argument("emp_id", help="Employee ID (e.g. emp-001)")
        parser.add_argument("name", help="Employee full name")
        parser.add_argument("--camera", default=None, help="Camera index or RTSP URL (default from config.yaml)")
        parser.add_argument("--samples", type=int, default=5, help="Number of face samples to capture (default 5)")
        args = parser.parse_args()

        ok = enroll_live(eng, args.emp_id, args.name, cam_source=args.camera, target_samples=args.samples)
        sys.exit(0 if ok else 1)

    # ---------- file enrollment ----------
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)

    emp_id = sys.argv[1]
    name = sys.argv[2]
    photo_paths = expand(sys.argv[3:])

    images = []
    for p in photo_paths:
        img = cv2.imread(p)
        if img is None:
            print(f"  ! cannot read {p}")
            continue
        images.append(img)
        print(f"  + loaded {p} ({img.shape[1]}x{img.shape[0]})")

    if not images:
        print("No usable images"); sys.exit(1)

    ok = eng.enroll(emp_id, images)
    if not ok:
        print("Enrollment failed: no usable face found in any photo")
        sys.exit(1)

    eng.save("gallery.npz")
    print(f"\nEnrolled '{emp_id}' ({name}) from {len(images)} photo(s).")
    print(f"Gallery now has {eng.gallery_size()} employee(s).")


if __name__ == "__main__":
    main()