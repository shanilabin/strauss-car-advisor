from fastapi.testclient import TestClient

from index import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["configured"]) == {"supabase", "gemini", "openrouter", "groq"}
    assert body["config_version"] and len(body["config_hash"]) == 64


def test_openapi_available() -> None:
    assert client.get("/openapi.json").status_code == 200
