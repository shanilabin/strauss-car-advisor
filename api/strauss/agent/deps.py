"""What the agent works with during one turn: the profile it may change, the config, the data, and a log
of what happened (cards to show, trace events, questions for the rep)."""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from strauss.agent.schemas import Card, TraceEvent
from strauss.config.bundle import ConfigBundle
from strauss.domain.models import Profile
from strauss.ports.repositories import ValueOfUseRepo


@dataclass(frozen=True)
class RepRequest:
    """A question the agent decided only the transport rep can answer (persisted by the service)."""

    field: str
    question: str
    context: dict[str, str]


@dataclass
class TurnLog:
    cards: list[Card] = field(default_factory=list)
    trace: list[TraceEvent] = field(default_factory=list)
    rep_requests: list[RepRequest] = field(default_factory=list)
    profile_changed: bool = False

    def event(
        self, kind: Literal["tool_call", "tool_result", "guard", "model"], name: str, data: dict[str, Any]
    ) -> None:
        self.trace.append(TraceEvent(kind=kind, name=name, data=data, at=datetime.now(UTC)))


@dataclass
class AgentDeps:
    profile: Profile
    bundle: ConfigBundle
    value_of_use: ValueOfUseRepo
    turn: TurnLog = field(default_factory=TurnLog)
