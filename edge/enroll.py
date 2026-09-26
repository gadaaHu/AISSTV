"""
Enroll one employee from one or more photos.

Usage:
    python enroll.py emp-001 "Abebe Kebede" photo1.jpg photo2.jpg photo3.jpg
    python enroll.py emp-002 "Sara Lemma"  sara_*.jpg
    python enroll.py --list
    python enroll.py --remove emp-001
"""
import sys
import glob
import yaml
import cv2
import logging
from face_engine import FaceEngine

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")


def expand(paths):
    out = []
    for p in paths:
        hits = glob.glob(p)
        out.extend(hits if hits else [p])
    return out


def main():
    cfg = yaml.safe_load(open("config.yaml"))
    eng = FaceEngine(
        model_name=cfg["face"]["model"],
        threshold=cfg["face"]["threshold"],
        min_face_px=cfg["face"]["min_box"],
    )
    eng.load("gallery.npz")

    # ---------- subcommands ----------
    if len(sys.argv) >= 2 and sys.argv[1] == "--list":
        emps = eng.list_employees()
        print(f"{len(emps)} enrolled employee(s):")
        for e in emps:
            print(" -", e)
        return

    if len(sys.argv) >= 3 and sys.argv[1] == "--remove":
        emp_id = sys.argv[2]
        if emp_id in eng.gallery:
            del eng.gallery[emp_id]
            eng.save("gallery.npz")
            print(f"Removed {emp_id}")
        else:
            print(f"Not found: {emp_id}")
        return

    # ---------- enroll ----------
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