from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_health_endpoint():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_parse_endpoint():
    response = client.post("/api/score/parse", json={"transcript": "double twenty, double twenty"})
    assert response.status_code == 200
    assert response.json()["candidates"][0]["darts"][0]["value"] == 40
