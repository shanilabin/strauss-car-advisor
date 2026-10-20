from fastapi.testclient import TestClient

from index import app

client = TestClient(app)


def test_health_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert set(body["configured"]) == {"supabase", "gemini", "payslip_gemini", "openrouter", "groq"}
    assert body["config_version"] and len(body["config_hash"]) == 64


def test_openapi_available() -> None:
    assert client.get("/openapi.json").status_code == 200


def test_a_dashboard_link_is_not_reported_as_configured() -> None:
    from strauss.settings import Settings

    wrong = Settings(
        supabase_url="https://supabase.com/dashboard/project/x", supabase_secret_key="sb_secret_x"
    )
    right = Settings(
        supabase_url="https://abcdefghijklmnopqrst.supabase.co", supabase_secret_key="sb_secret_x"
    )
    assert wrong.configured["supabase"] is False
    assert right.configured["supabase"] is True
