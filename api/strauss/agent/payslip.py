"""Reading a payslip: the model only COPIES what is printed - it never computes, converts or guesses.

Two ways in:
- a PDF with a text layer: the text is extracted here (pypdf), ID numbers are masked, and only that text
  goes to the model - any model in the chain can read it. Every number the model returns must appear in
  that text, so a number it made up is dropped (and then asked for, like any missing detail).
- an image, or a scanned PDF without text: the file itself goes to a model that reads images (Gemini).
  There is no text to check against, so the employee confirms every value before it is saved.

The file is never stored. The reading has no field for a name, an ID number or a bank account.
"""

import io
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field
from pydantic_ai import Agent
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from strauss.agent.guard import mask_ids, numbers
from strauss.domain.money import Money, Quantity

MIN_TEXT_CHARS = 80  # less than this from a PDF means it is a scan - read it as an image

INSTRUCTIONS = """You read an Israeli payslip (תלוש שכר) and copy values from it into the fields.

Rules:
- COPY numbers exactly as printed. Never calculate, convert, round, sum or estimate anything.
- A field whose line is not printed on the payslip stays null. Do not infer it from other lines.
- Amounts are monthly shekels for THIS month: use the "current month" column, not year-to-date totals.
- base_salary: "שכר יסוד" / "משכורת בסיס" / "שכר בסיס" (gross, before deductions).
- commissions: "עמלות". bonus: "בונוס" / "פרמיה" / "מענק" paid this month.
- pension_pct: the EMPLOYEE's pension contribution rate in percent ("תגמולי עובד", "פנסיה עובד %").
  Only a percent that is printed - never derive it from an amount. Same for study_fund_pct ("השתלמות עובד").
- credit_points: "נקודות זיכוי" (e.g. 2.25).
- value_of_use: "שווי שימוש רכב" / "שווי רכב" - the monthly taxable value of the company car.
- car_participation: the employee's monthly deduction for the company car ("השתתפות ברכב").
- car_text: the car's maker/model/year if printed (e.g. "טויוטה קורולה קרוס 2025"), else null.
- month: the payslip's month as printed (e.g. "09/2026"), else null.
- Never output names, ID numbers, addresses or bank details - there are no fields for them.
"""


class PayslipReading(BaseModel):
    """What was read from the payslip, as printed. null = not on the payslip."""

    model_config = ConfigDict(extra="forbid")

    month: str | None = Field(default=None, max_length=20)
    base_salary: Money | None = Field(default=None, ge=0)
    commissions: Money | None = Field(default=None, ge=0)
    bonus: Money | None = Field(default=None, ge=0)
    pension_pct: Quantity | None = Field(default=None, ge=0, le=100)
    study_fund_pct: Quantity | None = Field(default=None, ge=0, le=100)
    credit_points: Quantity | None = Field(default=None, ge=0, le=30)
    value_of_use: Money | None = Field(default=None, ge=0)
    car_participation: Money | None = Field(default=None, ge=0)
    car_text: str | None = Field(default=None, max_length=80)


NUMBER_FIELDS = (
    "base_salary",
    "commissions",
    "bonus",
    "pension_pct",
    "study_fund_pct",
    "credit_points",
    "value_of_use",
    "car_participation",
)


def build_payslip_agent() -> Agent[None, PayslipReading]:
    return Agent(
        None, output_type=PayslipReading, instructions=INSTRUCTIONS, retries=1, defer_model_check=True
    )


def pdf_text(data: bytes) -> str | None:
    """The PDF's text layer, ID numbers masked - or None for a scan (or a file that is not a PDF)."""
    try:
        reader = PdfReader(io.BytesIO(data))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:3])
    except (PdfReadError, ValueError, OSError):
        return None
    text = mask_ids(text)
    return text if len(text.strip()) >= MIN_TEXT_CHARS else None


def only_printed(reading: PayslipReading, text: str) -> tuple[PayslipReading, list[str]]:
    """Drop every number that does not appear in the payslip's text. Returns the kept reading and the
    fields that were dropped (the model invented them, or mis-copied them)."""
    printed = numbers(text)
    dropped = [
        name
        for name in NUMBER_FIELDS
        if (value := getattr(reading, name)) is not None and Decimal(value).normalize() not in printed
    ]
    return reading.model_copy(update=dict.fromkeys(dropped)), dropped
