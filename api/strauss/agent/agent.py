"""The PydanticAI agent: instructions, the conversation state block, the tools and the structured output.

The model writes words (text + quick replies). The cards with the numbers come from the tools, so
AgentReply = the model's words + the cards the tools produced in this turn.
"""

import json
import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field
from pydantic_ai import Agent, ModelRetry, RunContext
from pydantic_ai.models import Model

from strauss.agent.deps import AgentDeps
from strauss.agent.guard import FALLBACK_WITH_CARDS, FALLBACK_WITHOUT_CARDS, invented, tool_results
from strauss.agent.schemas import AgentReply
from strauss.agent.tools import DRIVE_HE, TOOLS
from strauss.domain.missing import missing_fields
from strauss.domain.options import WAIVER_ID, car_label

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

PROMPT = (Path(__file__).parent / "prompts" / "system.he.md").read_text(encoding="utf-8")


class ReplyDraft(BaseModel):
    """What the model returns at the end of a turn."""

    text: str = Field(description="Your message to the employee, in Hebrew. Words only - no money amounts.")
    quick_replies: list[str] = Field(
        default_factory=list, max_length=3, description="Up to 3 short suggestions"
    )


def state_block(deps: AgentDeps) -> str:
    """The conversation state the model needs this turn - recomputed every time, never remembered."""
    profile = deps.profile
    rules = deps.bundle.rules
    known = profile.model_dump(
        mode="json", exclude={"revision", "confirmed_participation"}, exclude_none=True
    )
    if isinstance(known.get("current"), dict) and "vehicle" in known["current"]:
        vehicle = known["current"]["vehicle"]
        known["current"]["vehicle"] = f"{vehicle['commercial_name']} ({vehicle['key']['reg_year']})"
    family = rules.special_tracks[0] if rules.special_tracks else None
    state = {
        "known_about_employee": known,
        "still_missing": [
            {"field": m.field, "ask": m.ask, "question": m.question} for m in missing_fields(profile)
        ],
        "occupations": [o.name for o in deps.bundle.occupations],
        # the option ids, so a question about "ATTO 3" goes straight to compare(["CAR-10"])
        "options": [
            {
                "id": c.id,
                "car": f"{c.maker_name} {car_label(c)}",
                "group": c.group,
                "drive": DRIVE_HE[c.drive],
            }
            for c in deps.bundle.catalog
        ]
        + [{"id": WAIVER_ID, "car": "ויתור על הרכב (אחזקה)"}],
        "children_age_limit": family.requires.child_max_age if family else None,
    }
    return (
        "## מצב השיחה (מחושב מחדש בכל הודעה)\n```json\n"
        + json.dumps(state, ensure_ascii=False, indent=1)
        + "\n```"
    )


def build_agent(model: Model | None = None) -> Agent[AgentDeps, ReplyDraft]:
    agent: Agent[AgentDeps, ReplyDraft] = Agent(
        model,
        deps_type=AgentDeps,
        output_type=ReplyDraft,
        instructions=PROMPT,
        tools=TOOLS,
        retries=2,
        defer_model_check=True,
    )

    @agent.instructions
    def conversation_state(ctx: RunContext[AgentDeps]) -> str:
        return state_block(ctx.deps)

    @agent.output_validator
    def number_guard(ctx: RunContext[AgentDeps], draft: ReplyDraft) -> ReplyDraft:
        turn = ctx.deps.turn
        allowed = tool_results(ctx.messages) + "\n" + state_block(ctx.deps)
        bad = invented(" ".join([draft.text, *draft.quick_replies]), allowed)
        if not bad:
            turn.event("guard", "number_guard", {"passed": True})
            return draft
        if turn.guard_retries == 0:
            turn.guard_retries += 1
            turn.event("guard", "number_guard", {"passed": False, "action": "retry", "numbers": bad})
            raise ModelRetry(
                f"Your reply contains numbers that no tool returned: {bad}. Rewrite it in words only - "
                "the cards on screen show every amount."
            )
        turn.event("guard", "number_guard", {"passed": False, "action": "template", "numbers": bad})
        text = FALLBACK_WITH_CARDS if turn.cards else FALLBACK_WITHOUT_CARDS
        return ReplyDraft(text=text)

    return agent


@lru_cache
def default_agent() -> Agent[AgentDeps, ReplyDraft]:
    return build_agent()


def to_reply(draft: ReplyDraft, deps: AgentDeps) -> AgentReply:
    return AgentReply(text=draft.text, quick_replies=draft.quick_replies, cards=list(deps.turn.cards))
