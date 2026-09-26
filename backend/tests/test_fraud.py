from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_root():
    r = client.get("/")
    assert r.status_code == 200
    assert "service" in r.json()


def test_health_ok():
    r = client.get("/health")
    assert r.status_code in (200, 503)   # 503 if DB is down
    body = r.json()
    assert "status" in body
    assert "db" in body