"""One conversation turn with the agent (ARCHITECTURE section 5).

Load the conversation (owner only) -> mask ID numbers -> run the agent on the stored state and the recent
messages -> save the profile with compare-and-set -> open the rep questions it asked -> save the
comparisons it showed -> save both messages with the cards and the trace -> return reply + fresh state.

When no model can answer, nothing is saved and the UI switches to form mode (503, details.mode = "form").
When the model answers but gets stuck (a tool it keeps calling wrongly), the turn still completes with a
fixed reply - whatever the tools already established is kept.
"""

import asyncio
import logging
import threading
import time
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

from pydantic_ai.exceptions import AgentRunError, FallbackExceptionGroup, ModelAPIError
from pydantic_ai.messages import ModelMessage, ModelRequest, ModelResponse, TextPart, UserPromptPart
from pydantic_ai.models import Model
from pydantic_ai.settings import ModelSettings
from pydantic_ai.usage import UsageLimits

from strauss.agent.agent import ReplyDraft, default_agent, to_reply
from strauss.agent.deps import AgentDeps
from strauss.agent.guard import mask_ids
from strauss.agent.models_chain import AgentUnavailable
from strauss.agent.schemas import ComparisonCard, OptionsCard, RepPendingCard
from strauss.config.bundle import ConfigBundle
from strauss.errors import ApiError
from strauss.http.schemas import ConversationStatus, MessageRole, TurnResponse
from strauss.ports.repositories import AuthUser, ConversationRecord, ConversationRepo, ValueOfUseRepo
from strauss.services.conversations import ConversationService, stale_revision, status_for

logger = logging.getLogger("strauss.agent")

HISTORY_MESSAGES = 12
LIMITS = UsageLimits(request_limit=12)  # a runaway tool loop ends here instead of burning the free quota
# Low thinking keeps a turn in seconds; the timeout hands a stuck provider over to the next in the chain.
SETTINGS = ModelSettings(temperature=0.2, thinking="low", timeout=30)
NO_MODEL = (AgentUnavailable, ModelAPIError, FallbackExceptionGroup)  # -> form mode
STUCK_REPLY = "סליחה, לא הצלחתי להשלים את הבקשה. אפשר לנסח אותה אחרת?"


def agent_unavailable() -> ApiError:
    return ApiError(503, "agent_unavailable", "הצ'אט לא זמין כרגע. אפשר להמשיך בטופס", {"mode": "form"})


@lru_cache
def _agent_loop() -> asyncio.AbstractEventLoop:
    """One event loop, on its own thread, for every agent run in this process.

    The model clients (httpx connection pools) are created once and belong to the loop they first ran on;
    running each request on its worker thread's own loop would hand them a foreign loop.
    """
    loop = asyncio.new_event_loop()
    threading.Thread(target=loop.run_forever, name="agent-loop", daemon=True).start()
    return loop


def _run[T](coroutine: Coroutine[Any, Any, T]) -> T:
    return asyncio.run_coroutine_threadsafe(coroutine, _agent_loop()).result()


def history(rows: list[dict[str, Any]]) -> list[ModelMessage]:
    """The last stored messages as model messages: the employee's words and the bot's words only.
    Cards and trace stay out - the model gets the current facts from the state block instead."""
    messages: list[ModelMessage] = []
    for row in rows[-HISTORY_MESSAGES:]:
        if row["role"] == MessageRole.ASSISTANT:
            messages.append(ModelResponse(parts=[TextPart(row["content"])]))
        elif row["role"] == MessageRole.USER:
            messages.append(ModelRequest(parts=[UserPromptPart(row["content"])]))
        else:  # system_event - e.g. the rep's answer
            messages.append(ModelRequest(parts=[UserPromptPart(f"[עדכון מהמערכת] {row['content']}")]))
    while messages and isinstance(messages[0], ModelResponse):  # a history must start with a request
        messages.pop(0)
    return messages


class TurnService:
    def __init__(
        self,
        conversations: ConversationService,
        repo: ConversationRepo,
        value_of_use: ValueOfUseRepo,
        bundle: ConfigBundle,
        model: Callable[[], Model],
    ) -> None:
        self._conversations = conversations
        self._repo = repo
        self._vou = value_of_use
        self._bundle = bundle
        self._model = model

    def send(self, user: AuthUser, conversation_id: str, text: str) -> TurnResponse:
        record = self._conversations.owned(user, conversation_id)
        text = mask_ids(text)
        asked_at = datetime.now(UTC)
        deps = AgentDeps(profile=record.profile, bundle=self._bundle, value_of_use=self._vou)
        draft = self._think(record, deps, text)

        record = self._save_profile(record, deps)
        questions = self._ask_rep(record, deps)
        for card in deps.turn.cards:
            if isinstance(card, ComparisonCard | OptionsCard):
                results = card.comparison.results
                chosen = None if isinstance(card, OptionsCard) else [r.option.id for r in results]
                request = {"option_ids": chosen, "revision": record.profile.revision}
                self._repo.save_comparison(record.id, request, card.comparison)
        record = self._update_status(record, deps, len(questions))
        reply = to_reply(draft, deps)

        payload = {
            "cards": [card.model_dump(mode="json") for card in reply.cards],
            "quick_replies": reply.quick_replies,
            "trace": [event.model_dump(mode="json") for event in deps.turn.trace],
        }
        answered_at = max(datetime.now(UTC), asked_at + timedelta(milliseconds=1))  # strictly after
        question = {"role": MessageRole.USER, "content": text, "payload": {}}
        answer = {"role": MessageRole.ASSISTANT, "content": reply.text, "payload": payload}
        self._repo.add_messages(
            record.id,
            [
                {**question, "created_at": asked_at.isoformat()},
                {**answer, "created_at": answered_at.isoformat()},
            ],
        )
        state = self._conversations.state(record, questions)
        return TurnResponse(reply=reply, trace=deps.turn.trace, state=state)

    # ── Steps ────────────────────────────────────────────────────────────────

    def _think(self, record: ConversationRecord, deps: AgentDeps, text: str) -> ReplyDraft:
        started = time.perf_counter()
        try:
            result = _run(
                default_agent().run(
                    text,
                    deps=deps,
                    model=self._model(),
                    message_history=history(self._repo.messages(record.id)),
                    model_settings=SETTINGS,
                    usage_limits=LIMITS,
                )
            )
        except NO_MODEL as exc:
            logger.warning("no model answered for conversation %s: %r", record.id, exc)
            raise agent_unavailable() from exc
        except AgentRunError as exc:  # the model answered but got stuck - keep what the tools did
            logger.warning("agent got stuck in conversation %s: %r", record.id, exc)
            deps.turn.event("model", "stuck", {"error": type(exc).__name__})
            return ReplyDraft(text=STUCK_REPLY)
        usage = result.usage
        deps.turn.event(
            "model",
            result.response.model_name or "unknown",
            {
                "requests": usage.requests,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "ms": round((time.perf_counter() - started) * 1000),
            },
        )
        return result.output

    def _save_profile(self, record: ConversationRecord, deps: AgentDeps) -> ConversationRecord:
        """What the agent learned, saved with compare-and-set on the revision."""
        if not deps.turn.profile_changed:
            return record
        revision = record.profile.revision
        updated = deps.profile.model_copy(update={"revision": revision + 1})
        saved = self._repo.update_profile(record.id, updated, record.status, expected_revision=revision)
        if saved is None:  # the profile was corrected in another tab while the agent was thinking
            raise stale_revision(revision, revision + 1)
        return saved

    def _ask_rep(self, record: ConversationRecord, deps: AgentDeps) -> list[dict[str, Any]]:
        """Opens the questions the agent asked (one open question per field) and returns all open ones."""
        questions = self._repo.open_questions(record.id)
        already_open = {q["field"] for q in questions}
        for request in deps.turn.rep_requests:
            if request.field in already_open:
                continue
            row = self._repo.open_question(
                record.id, request.field, request.question, request.context, record.profile.revision
            )
            if row is None:  # opened meanwhile by another turn
                continue
            questions.append(row)
            deps.turn.cards.append(
                RepPendingCard(question_id=row["id"], field=request.field, question=request.question)
            )
        return questions

    def _update_status(
        self, record: ConversationRecord, deps: AgentDeps, open_questions: int
    ) -> ConversationRecord:
        presented = any(isinstance(c, ComparisonCard | OptionsCard) for c in deps.turn.cards) or (
            record.status == ConversationStatus.PRESENTED and not deps.turn.profile_changed
        )
        status = status_for(record.profile, open_questions, presented)
        if status == record.status:
            return record
        self._repo.set_status(record.id, status)
        return ConversationRecord(record.id, record.user_id, status, record.profile)
