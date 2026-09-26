"""Quick sanity test — press q to quit."""
import cv2, time, yaml, logging
from stream_reader import StreamReader

logging.basicConfig(level=logging.INFO)

cfg = yaml.safe_load(open("config.yaml"))
reader = StreamReader(cfg["camera"]["url"]).start()

t0 = time.time()
count = 0
try:
    while True:
        frame = reader.read()
        if frame is None:
            time.sleep(0.01)
            continue
        count += 1
        cv2.imshow("stream", frame)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break
        if time.time() - t0 > 1:
            print(f"~{count} fps, stats={reader.stats()}")
            count = 0
            t0 = time.time()
finally:
    reader.stop()
    cv2.destroyAllWindows()