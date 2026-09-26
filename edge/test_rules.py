"""
Simulate a morning at the office with no camera involved.
Run:  python test_rules.py
"""
import time
from datetime import datetime, time, timedelta, timezone
from rules_engine import RulesEngine, _now

# Speed up: pretend 1 real second = 1 simulated second (you can shrink further)
engine = RulesEngine(
    camera_id="cam-test",
    zone="main-entrance",
    shift_start="09:00",
    grace_minutes=15,
    exit_timeout_sec=5,       # 5s instead of 20s so the test is fast
    min_frames_for_enter=3,
)


def show(evts):
    for e in evts:
        print(f"  >> {e['type']:10s} emp={e['employee_id']} "
              f"conf={e['confidence']:.2f} meta={e['meta']}")


def step(label, seconds=1):
    print(f"\n[{label}]")
    t0 = time.time()
    while time.time() - t0 < seconds:
        # three frames per simulated second
        for _ in range(3):
            show(engine.update(17, "emp-001", 0.62))
            time.sleep(1 / 3)
        show(engine.sweep())


def scenario_simple_present():
    print("=" * 60)
    print("SCENARIO 1: employee walks in and stands still for 3s")
    print("=" * 60)
    step("employee appears", 2)
    step("employee leaves frame (waiting for EXIT timeout)", 6)
    print("\nFinal state:", engine.snapshot_state())


def scenario_jittery_face():
    print("\n" + "=" * 60)
    print("SCENARIO 2: face jitter — ID flickers between emp-001 and None")
    print("=" * 60)
    engine2 = RulesEngine("cam-test", "door", exit_timeout_sec=5,
                          min_frames_for_enter=3)
    t0 = time.time()
    i = 0
    while time.time() - t0 < 3:
        # alternate high-conf ID with low-conf None, like a turning head
        eid = "emp-001" if i % 3 == 0 else None
        conf = 0.60 if eid else 0.20
        for e in engine2.update(42, eid, conf):
            print(f"  >> {e['type']:10s} emp={e['employee_id']}")
        i += 1
        time.sleep(0.2)
    # stop feeding, wait for EXIT
    time.sleep(6)
    for e in engine2.sweep():
        print(f"  >> {e['type']:10s} emp={e['employee_id']} meta={e['meta']}")


def scenario_late_arrival():
    print("\n" + "=" * 60)
    print("SCENARIO 3: LATE detection (fake clock)")
    print("=" * 60)
    engine3 = RulesEngine("cam-test", "door", shift_start="09:00",
                          grace_minutes=15, exit_timeout_sec=5,
                          min_frames_for_enter=1)
    # monkeypatch _local_now to fake 09:20
    fake_local = _now().astimezone(engine3.tz).replace(hour=9, minute=20, second=0)
    engine3._local_now = lambda: fake_local
    engine3._day = fake_local.date()

    for _ in range(3):
        for e in engine3.update(1, "emp-009", 0.70):
            print(f"  >> {e['type']:10s} emp={e['employee_id']} meta={e['meta']}")
        time.sleep(0.2)


def scenario_reentry():
    print("\n" + "=" * 60)
    print("SCENARIO 4: employee leaves for lunch and comes back")
    print("=" * 60)
    engine4 = RulesEngine("cam-test", "door", exit_timeout_sec=3,
                          min_frames_for_enter=1)
    # first pass
    for _ in range(3):
        for e in engine4.update(1, "emp-005", 0.70):
            print(f"  >> {e['type']:10s} emp={e['employee_id']}")
        time.sleep(0.2)
    # disappear long enough for EXIT
    time.sleep(4)
    for e in engine4.sweep():
        print(f"  >> {e['type']:10s} emp={e['employee_id']}")
    # come back
    for _ in range(3):
        for e in engine4.update(2, "emp-005", 0.70):   # NEW track_id
            print(f"  >> {e['type']:10s} emp={e['employee_id']}")
        time.sleep(0.2)


def scenario_unknown():
    print("\n" + "=" * 60)
    print("SCENARIO 5: stranger loiters — should emit UNKNOWN")
    print("=" * 60)
    engine5 = RulesEngine("cam-test", "door", unknown_alert_sec=1,
                          min_frames_for_enter=1)
    t0 = time.time()
    while time.time() - t0 < 3:
        for e in engine5.update(99, None, 0.0):
            print(f"  >> {e['type']:10s}")
        time.sleep(0.2)


if __name__ == "__main__":
    scenario_simple_present()
    scenario_jittery_face()
    scenario_late_arrival()
    scenario_reentry()
    scenario_unknown()
    print("\nAll scenarios completed.")