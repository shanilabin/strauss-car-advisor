"""Reading a payslip (POST /v1/payslip/parse) with a scripted model: the model only copies what is printed,
a number that is not on the payslip is dropped, and nothing about the person comes back."""

import base64
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from index import app
from strauss.agent.payslip import PayslipReading, only_printed, pdf_text
from strauss.http.deps import get_payslip_text_model, get_vision_model
from strauss.settings import Settings, payslip_settings
from tests.api.conftest import AS_NOA, ModelSlot
from tests.scripted import scripted

client = TestClient(app)
FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"
PDF = (FIXTURES / "payslip-demo-1.pdf").read_bytes()  # fictitious, made for the demo
PNG = (FIXTURES / "payslip-demo-2.png").read_bytes()
AS_PRINTED = {  # what payslip-demo-1 shows
    "month": "09/2026",
    "base_salary": 18500,
    "pension_pct": 6,
    "study_fund_pct": 2.5,
    "credit_points": 2.75,
    "value_of_use": 4070,
    "car_participation": 300,
    "car_text": "טויוטה קורולה קרוס 2025",
}


@pytest.fixture(autouse=True)
def payslip_reads_on_the_scripted_model(model: ModelSlot) -> None:
    app.dependency_overrides[get_payslip_text_model] = lambda: model


def read(
    model: ModelSlot, reading: dict[str, Any], data: bytes = PDF, content_type: str = "application/pdf"
) -> Any:
    model.factory = lambda: scripted(("final_result", reading))
    body = {"content_type": content_type, "data_base64": base64.b64encode(data).decode()}
    return client.post("/v1/payslip/parse", json=body, headers=AS_NOA)


def test_a_text_pdf_is_read_into_the_fields_as_printed(model: ModelSlot) -> None:
    response = read(model, AS_PRINTED)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["read_from"] == "text" and body["not_confirmed"] == []
    reading = body["reading"]
    assert reading["base_salary"] == 18500 and reading["value_of_use"] == 4070
    assert reading["commissions"] is None  # not on the payslip -> not filled in


def test_a_number_that_is_not_on_the_payslip_is_dropped(model: ModelSlot) -> None:
    body = read(model, {**AS_PRINTED, "base_salary": 19500, "bonus": 1000}).json()
    assert body["reading"]["base_salary"] is None and body["reading"]["bonus"] is None
    assert sorted(body["not_confirmed"]) == ["base_salary", "bonus"]
    assert body["reading"]["value_of_use"] == 4070  # the rest is kept


def test_the_model_never_sees_the_id_number(model: ModelSlot) -> None:
    seen: list[Any] = []
    model.factory = lambda: scripted(("final_result", AS_PRINTED), seen=seen)
    body = {"content_type": "application/pdf", "data_base64": base64.b64encode(PDF).decode()}
    assert client.post("/v1/payslip/parse", json=body, headers=AS_NOA).status_code == 200
    sent = str(seen[0])
    assert "123456782" not in sent and "18,500.00" in sent


def test_an_image_goes_to_the_model_that_reads_images(model: ModelSlot) -> None:
    vision = ModelSlot()
    vision.factory = lambda: scripted(("final_result", {"base_salary": 32000, "bonus": 2000}))
    app.dependency_overrides[get_vision_model] = lambda: vision
    response = read(model, {}, data=PNG, content_type="image/png")
    assert response.status_code == 200, response.text
    assert response.json()["read_from"] == "image" and vision.calls == 1 and model.calls == 0


def test_a_file_that_is_not_a_payslip_type_is_refused() -> None:
    body = {"content_type": "application/zip", "data_base64": "AAAA"}
    assert client.post("/v1/payslip/parse", json=body, headers=AS_NOA).status_code == 422


def test_a_broken_file_is_unreadable_in_hebrew(model: ModelSlot) -> None:
    body = {"content_type": "application/pdf", "data_base64": "not base64!"}
    response = client.post("/v1/payslip/parse", json=body, headers=AS_NOA)
    assert response.status_code == 422 and response.json()["error"]["code"] == "payslip_unreadable"


def test_reading_a_payslip_requires_sign_in() -> None:
    body = {"content_type": "application/pdf", "data_base64": base64.b64encode(PDF).decode()}
    assert client.post("/v1/payslip/parse", json=body).status_code == 401


def test_only_printed_numbers_survive() -> None:
    text = pdf_text(PDF)
    assert text is not None and "[ת״ז הוסתרה]" in text
    kept, dropped = only_printed(PayslipReading(base_salary=18500, credit_points=3), text)
    assert kept.base_salary == 18500 and kept.credit_points is None and dropped == ["credit_points"]


def test_something_that_is_not_a_pdf_has_no_text() -> None:
    assert pdf_text(b"plain bytes") is None
    assert pdf_text(PNG) is None


def test_a_separate_payslip_key_keeps_the_chat_quota_apart() -> None:
    both = Settings(gemini_api_key="chat", payslip_gemini_api_key="payslip")
    assert payslip_settings(both).gemini_api_key == "payslip" and both.gemini_api_key == "chat"
    only_chat = Settings(gemini_api_key="chat", payslip_gemini_api_key="")
    assert payslip_settings(only_chat).gemini_api_key == "chat"


# ── Edge cases (fictitious payslips in tests/fixtures) ───────────────────────

AMOUNTS_ONLY = (FIXTURES / "payslip-amounts-only.pdf").read_bytes()  # pension as an amount, a YTD column
SCANNED = (FIXTURES / "payslip-scanned.pdf").read_bytes()  # a picture inside a PDF: no text layer
NOT_A_PAYSLIP = (FIXTURES / "not-a-payslip.pdf").read_bytes()


def test_a_percent_the_payslip_does_not_print_is_never_derived(model: ModelSlot) -> None:
    """Pension and study fund printed only as amounts: a model that "helpfully" computes 6% is dropped."""
    reading = {"base_salary": 14200, "pension_pct": 6, "study_fund_pct": 2.5, "credit_points": 2.25,
               "value_of_use": 3130, "car_participation": 250}  # fmt: skip
    body = read(model, reading, data=AMOUNTS_ONLY).json()
    assert sorted(body["not_confirmed"]) == ["pension_pct", "study_fund_pct"]
    kept = body["reading"]
    assert (kept["base_salary"], kept["value_of_use"], kept["car_participation"]) == (14200, 3130, 250)


def test_a_number_from_another_fields_line_is_not_accepted(model: ModelSlot) -> None:
    """The value of use (3,130) read as the base salary: printed on the payslip, but not beside its label."""
    body = read(model, {"base_salary": 3130, "value_of_use": 3130}, data=AMOUNTS_ONLY).json()
    assert body["not_confirmed"] == ["base_salary"] and body["reading"]["value_of_use"] == 3130


def test_table_columns_glued_by_the_pdf_are_read_apart() -> None:
    """ "14,200.00113,600.00" (this month | year to date) is two numbers, not one."""
    text = pdf_text(AMOUNTS_ONLY)
    assert text is not None and "14,200.00 113,600.00" in text
    kept, dropped = only_printed(PayslipReading(base_salary=14200), text)
    assert kept.base_salary == 14200 and dropped == []


def test_a_scanned_pdf_is_read_as_an_image(model: ModelSlot) -> None:
    vision = ModelSlot()
    vision.factory = lambda: scripted(("final_result", {"base_salary": 14200}))
    app.dependency_overrides[get_vision_model] = lambda: vision
    response = read(model, {}, data=SCANNED)
    assert response.status_code == 200 and response.json()["read_from"] == "image"
    assert vision.calls == 1 and model.calls == 0


def test_a_document_that_is_not_a_payslip_comes_back_empty(model: ModelSlot) -> None:
    """An invitation: the model finds no payslip line, and the screen says so (nothing to save)."""
    body = read(model, {}, data=NOT_A_PAYSLIP).json()
    assert body["read_from"] == "text"
    assert all(value is None for value in body["reading"].values())
