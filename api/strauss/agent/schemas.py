"""What the agent returns for one turn.

The reply text is words only. Every number the employee sees travels inside a card, which carries
the engine's own DTO, so the UI renders numbers from the engine - never from model text.
"""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from strauss.domain.models import Comparison, MissingField


class AgentModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ComparisonCard(AgentModel):
    """Today versus one or more chosen alternatives."""

    kind: Literal["comparison"] = "comparison"
    comparison: Comparison


class OptionsCard(AgentModel):
    """Every alternative the employee may choose, ranked by net impact."""

    kind: Literal["options"] = "options"
    comparison: Comparison


class MissingCard(AgentModel):
    kind: Literal["missing"] = "missing"
    missing: list[MissingField]


class RepPendingCard(AgentModel):
    kind: Literal["rep_pending"] = "rep_pending"
    question_id: str
    field: str
    question: str


Card = Annotated[ComparisonCard | OptionsCard | MissingCard | RepPendingCard, Field(discriminator="kind")]


class AgentReply(AgentModel):
    text: str = Field(description="Words only. Numbers are shown from cards.")
    quick_replies: list[str] = Field(default_factory=list, max_length=6)
    cards: list[Card] = Field(default_factory=list)


class TraceEvent(AgentModel):
    """One step the agent took in a turn - powers the "under the hood" panel."""

    kind: Literal["tool_call", "tool_result", "guard", "model"]
    name: str
    data: dict[str, Any] = Field(default_factory=dict)
    at: datetime
