"""API request and response shapes that are not domain results (ARCHITECTURE.md, section 7)."""

from datetime import date, datetime
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from strauss.agent.payslip import PayslipReading
from strauss.agent.schemas import AgentReply, Card, TraceEvent
from strauss.config.models import GroupBudget
from strauss.domain.models import (
    Arrangement,
    Comparison,
    Deductions,
    MissingField,
    Profile,
    SalaryInput,
)


class ApiModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# ── Conversations ────────────────────────────────────────────────────────────


class ConversationStatus(StrEnum):
    COLLECTING = "COLLECTING"
    READY = "READY"
    PRESENTED = "PRESENTED"
    WAITING_REP = "WAITING_REP"


class MessageRole(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM_EVENT = "system_event"


class MessageOut(ApiModel):
    id: str
    role: MessageRole
    text: str
    cards: list[Card] = Field(default_factory=list)
    trace: list[TraceEvent] = Field(
        default_factory=list,
        description="Assistant messages: the agent actions of the turn that produced this reply "
        "(shown under the message as 'show AI actions')",
    )
    created_at: datetime


class RepQuestionStatus(StrEnum):
    OPEN = "OPEN"
    ANSWERED = "ANSWERED"


class RepAnswer(ApiModel):
    value: str
    effective_from: date | None = None
    answered_at: datetime


class RepQuestionOut(ApiModel):
    """What a rep sees: the question and the minimum context to answer it - no salary, no chat."""

    id: str
    conversation_id: str
    field: str
    question: str
    context: dict[str, str] = Field(default_factory=dict)
    status: RepQuestionStatus
    answer: RepAnswer | None = None
    created_at: datetime


class ConversationState(ApiModel):
    id: str
    status: ConversationStatus
    profile: Profile
    missing: list[MissingField] = Field(default_factory=list)
    messages: list[MessageOut] = Field(default_factory=list)
    open_questions: list[RepQuestionOut] = Field(default_factory=list)
    latest_comparison: Comparison | None = None


class CreateConversationRequest(ApiModel):
    sample_employee_id: str | None = Field(
        default=None, description="Start from one of the challenge's sample employees (demo only)"
    )


class SendMessageRequest(ApiModel):
    text: str = Field(min_length=1, max_length=2000)


class TurnResponse(ApiModel):
    reply: AgentReply
    trace: list[TraceEvent] = Field(default_factory=list)
    state: ConversationState


class ProfilePatch(ApiModel):
    """Partial update. Fields that are left out, or sent as null, stay as they are."""

    expected_revision: int | None = Field(
        default=None, description="If set and stale, the update is rejected with 409"
    )
    first_name: str | None = Field(default=None, min_length=1, max_length=30)
    occupation: str | None = None
    group: str | None = None
    salary: SalaryInput | None = None
    deductions: Deductions | None = None
    children_under_23: int | None = Field(default=None, ge=0, le=30)
    current: Arrangement | None = None


class CompareRequest(ApiModel):
    option_ids: list[str] = Field(min_length=1, max_length=30)


class StatelessCompareRequest(ApiModel):
    profile: Profile
    option_ids: list[str] | None = Field(default=None, description="None = every option")


class RepRequest(ApiModel):
    option_id: str = Field(min_length=1, max_length=40)


# ── Rep ──────────────────────────────────────────────────────────────────────


class RepAnswerRequest(ApiModel):
    value: str = Field(min_length=1, max_length=500)
    effective_from: date | None = None


# ── Config ───────────────────────────────────────────────────────────────────


class ConfigSummary(ApiModel):
    version: str
    config_hash: str
    payroll_tax_year: int
    value_of_use_tax_year: int
    groups: list[GroupBudget]
    rules: dict[str, Any] = Field(description="The full active rules file, for the 'why?' popover")


# ── Errors ───────────────────────────────────────────────────────────────────


class ErrorBody(ApiModel):
    code: str
    message_he: str
    details: dict[str, Any] | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody


# ── Payslip ──────────────────────────────────────────────────────────────────


class PayslipParseRequest(ApiModel):
    """The file as base64 (a payslip is small; JSON keeps the client simple). Never stored."""

    content_type: Literal["application/pdf", "image/png", "image/jpeg", "image/webp"]
    data_base64: str = Field(min_length=1, max_length=4_300_000)


class PayslipParseResponse(ApiModel):
    reading: PayslipReading = Field(description="Values as printed; null = not on the payslip")
    read_from: Literal["text", "image"] = Field(
        description="text: from the PDF's text, every number checked against it. image: read from the "
        "picture - the employee must confirm every value"
    )
    not_confirmed: list[str] = Field(
        default_factory=list,
        description="Fields the model returned but the payslip's text does not contain - dropped, ask them",
    )
