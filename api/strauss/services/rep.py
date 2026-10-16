"""The transport rep's side of a conversation (ARCHITECTURE section 5, rep flow).

answer():
 1. validate the answer for the field (a participation is an amount, an occupation is a listed name)
 2. atomic OPEN -> ANSWERED (UPDATE ... WHERE status = 'OPEN'); a second answer gets 409
 3. apply it to that one field of the CURRENT profile (compare-and-set, re-read on a race), unless the
    employee changed what the question was about meanwhile - then it is kept but not applied
 4. a system_event message, then one resume: the engine recomputes and a new bot message carries the card

The resume is deterministic - the engine and a fixed sentence, no LLM call: the numbers come from the
engine either way, it works when every model is rate-limited, and it doesn't spend the free quota.
"""

import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from strauss.agent.schemas import Card, ComparisonCard, MissingCard, OptionsCard, TraceEvent
from strauss.config.bundle import ConfigBundle
from strauss.domain.compare import IncompleteProfile, UnknownOption, compare
from strauss.domain.models import Profile
from strauss.domain.options import car_label
from strauss.errors import ApiError
from strauss.http.schemas import MessageRole, RepAnswerRequest, RepQuestionOut
from strauss.ports.repositories import AuthUser, ConversationRecord, ConversationRepo
from strauss.services.conversations import question_out, status_for

logger = logging.getLogger("strauss.rep")

PARTICIPATION = "participation:"
OCCUPATION = "occupation"
# "350", "1,200", "350 ₪", "₪350", "350 ש״ח"
AMOUNT = re.compile(r"^\s*₪?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:₪|ש\"ח|ש״ח|שקלים|שקל)?\s*$")
APPLY_ATTEMPTS = 3  # the employee may be saving at the same moment - re-read and re-apply


def not_found() -> ApiError:
    return ApiError(404, "question_not_found", "השאלה לא נמצאה")


class RepService:
    def __init__(self, repo: ConversationRepo, bundle: ConfigBundle) -> None:
        self._repo = repo
        self._bundle = bundle

    def questions(self, status: str | None) -> list[RepQuestionOut]:
        return [question_out(row) for row in self._repo.list_questions(status)]

    def answer(self, rep: AuthUser, question_id: str, request: RepAnswerRequest) -> RepQuestionOut:
        row = self._get(question_id)
        value = self._parse(row["field"], request.value)  # 422 before anything is written
        answer = {
            "value": request.value.strip(),
            "effective_from": request.effective_from.isoformat() if request.effective_from else None,
        }
        answered = self._repo.answer_question(question_id, answer, rep.id)
        if answered is None:
            self._repair(question_id)
            raise ApiError(409, "already_answered", "השאלה כבר נענתה")
        self._resume(answered, value)
        return question_out(answered)

    # ── Steps ────────────────────────────────────────────────────────────────

    def _get(self, question_id: str) -> dict[str, Any]:
        try:
            uuid.UUID(question_id)
        except ValueError:
            raise not_found() from None
        row = self._repo.get_question(question_id)
        if row is None:
            raise not_found()
        return row

    def _repair(self, question_id: str) -> None:
        """The first answer won, but if applying it failed half way (a dropped connection after the answer
        was recorded), the retry finishes the job with the FIRST answer - otherwise it would be lost."""
        row = self._repo.get_question(question_id)
        if row is None or row["status"] != "ANSWERED" or not row.get("answer"):
            return
        value = self._parse(row["field"], row["answer"]["value"])
        record = self._repo.get(row["conversation_id"])
        if record is None or _applied(record.profile, row["field"], value):
            return
        asked_about = (row.get("context") or {}).get("occupation")
        if row["field"] == OCCUPATION and record.profile.occupation != asked_about:
            return  # deliberately not applied (the employee changed it) - nothing to repair
        logger.warning("re-applying rep answer %s that was recorded but not applied", question_id)
        self._resume(row, value)

    def _parse(self, field: str, raw: str) -> Decimal | str:
        if field.startswith(PARTICIPATION):
            match = AMOUNT.match(raw)
            try:
                amount = Decimal(match.group(1).replace(",", "")) if match else None
            except InvalidOperation:
                amount = None
            if amount is None:
                raise ApiError(
                    422, "invalid_answer", "צריך לכתוב סכום השתתפות חודשי בשקלים, למשל 350", {"field": field}
                )
            return amount
        if field == OCCUPATION:
            name = raw.strip()
            listed = [o.name for o in self._bundle.occupations]
            if name not in listed:
                raise ApiError(
                    422,
                    "invalid_answer",
                    "צריך לבחור עיסוק מטבלת העיסוקים",
                    {"field": field, "occupations": listed},
                )
            return name
        raise ApiError(422, "invalid_answer", "אי אפשר לענות על שאלה מהסוג הזה", {"field": field})

    def _resume(self, question: dict[str, Any], value: Decimal | str) -> None:
        conversation_id = question["conversation_id"]
        record = self._apply(question, value)
        now = datetime.now(UTC)
        field = question["field"]
        about = (question.get("context") or {}).get("requested_car") or self._car_label(field)
        if record is None:  # kept, not applied
            current = self._repo.get(conversation_id)
            if current is None:
                return
            self._repo.add_messages(
                conversation_id,
                [
                    _row(
                        MessageRole.SYSTEM_EVENT,
                        "נציג התחבורה ענה, אבל הפרטים בשיחה השתנו בינתיים, ולכן התשובה לא הוחלה.",
                        now,
                    )
                ],
            )
            self._refresh_status(current)
            return

        if field.startswith(PARTICIPATION):
            event = f"נציג התחבורה אישר את ההשתתפות ב-{about}."
            option_ids: list[str] | None = [field.removeprefix(PARTICIPATION)]
        else:
            event = f"נציג התחבורה אישר את העיסוק: {value}."
            option_ids = None
        text, card = self._recompute(record, option_ids)
        trace = [
            TraceEvent(kind="tool_result", name="rep_answer", data={"field": field, "applied": True}, at=now),
            TraceEvent(kind="tool_call", name="compare", data={"option_ids": option_ids or "all"}, at=now),
        ]
        self._repo.add_messages(
            conversation_id,
            [
                _row(MessageRole.SYSTEM_EVENT, event, now),
                _row(MessageRole.ASSISTANT, text, now + timedelta(milliseconds=1), [card], trace),
            ],
        )

    def _car_label(self, field: str) -> str:
        car_id = field.removeprefix(PARTICIPATION)
        car = next((c for c in self._bundle.catalog if c.id == car_id), None)
        return car_label(car) if car else "הרכב המבוקש"

    def _apply(self, question: dict[str, Any], value: Decimal | str) -> ConversationRecord | None:
        """The answer on that one field of the current profile. None if it no longer applies."""
        conversation_id = question["conversation_id"]
        field = question["field"]
        for _ in range(APPLY_ATTEMPTS):
            record = self._repo.get(conversation_id)
            if record is None:
                return None
            profile = record.profile
            changes: dict[str, Any]
            if field.startswith(PARTICIPATION) and isinstance(value, Decimal):
                car_id = field.removeprefix(PARTICIPATION)
                changes = {"confirmed_participation": {**profile.confirmed_participation, car_id: value}}
            elif field == OCCUPATION and isinstance(value, str):
                asked_about = (question.get("context") or {}).get("occupation")
                if profile.occupation != asked_about:  # the employee corrected it meanwhile
                    return None
                changes = {"occupation": value}
            else:
                return None
            updated = Profile.model_validate(
                {**profile.model_dump(), **changes, "revision": profile.revision + 1}
            )
            open_questions = len(self._repo.open_questions(conversation_id))
            status = status_for(updated, open_questions, presented=True)
            saved = self._repo.update_profile(conversation_id, updated, status, profile.revision)
            if saved is not None:
                return saved
        logger.warning("rep answer for %s not applied: the profile kept changing", conversation_id)
        return None

    def _recompute(self, record: ConversationRecord, option_ids: list[str] | None) -> tuple[str, Card]:
        try:
            comparison = compare(record.profile, self._bundle, option_ids)
        except IncompleteProfile as incomplete:
            return "כדי להשלים את ההשוואה חסרים עוד כמה פרטים.", MissingCard(missing=incomplete.missing)
        except UnknownOption:  # the catalog changed since the question was asked
            comparison = compare(record.profile, self._bundle, None)
            option_ids = None
        request = {"option_ids": option_ids, "revision": record.profile.revision, "source": "rep_answer"}
        self._repo.save_comparison(record.id, request, comparison)
        if option_ids is None:
            return "הנה כל האפשרויות, מעודכנות לפי תשובת הנציג.", OptionsCard(comparison=comparison)
        return "הנה ההשוואה המעודכנת לפי תשובת הנציג.", ComparisonCard(comparison=comparison)

    def _refresh_status(self, record: ConversationRecord) -> None:
        presented = self._repo.latest_comparison(record.id) is not None
        status = status_for(record.profile, len(self._repo.open_questions(record.id)), presented)
        if status != record.status:
            self._repo.set_status(record.id, status)


def _applied(profile: Profile, field: str, value: Decimal | str) -> bool:
    if field.startswith(PARTICIPATION):
        return profile.confirmed_participation.get(field.removeprefix(PARTICIPATION)) == value
    return profile.occupation == value


def _row(
    role: MessageRole,
    content: str,
    at: datetime,
    cards: list[Card] | None = None,
    trace: list[TraceEvent] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    if cards:
        payload["cards"] = [card.model_dump(mode="json") for card in cards]
    if trace:
        payload["trace"] = [event.model_dump(mode="json") for event in trace]
    return {"role": role, "content": content, "payload": payload, "created_at": at.isoformat()}
