"""Conversation use cases without the agent: create, read, correct the profile, list options, compare.

Every call checks that the conversation belongs to the caller; a conversation that isn't theirs is
"not found" (its existence isn't revealed). Facts the employee can't vouch for are re-established here:
today's car is re-read from the Tax Authority data by its key.
"""

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import TypeAdapter

from strauss.agent.schemas import Card, TraceEvent
from strauss.config.bundle import ConfigBundle
from strauss.config.loader import load_sample_employees
from strauss.config.samples import to_profile
from strauss.domain.compare import compare, rerun
from strauss.domain.missing import missing_fields, rep_context, rep_question
from strauss.domain.models import CarArrangement, Comparison, ParticipationStatus, Profile
from strauss.errors import ApiError
from strauss.http.schemas import (
    ConversationListItem,
    ConversationState,
    ConversationStatus,
    MessageOut,
    MessageRole,
    ProfilePatch,
    RepQuestionOut,
)
from strauss.ports.repositories import AuthUser, ConversationRecord, ConversationRepo, ValueOfUseRepo

CARDS = TypeAdapter(list[Card])
LIST_LIMIT = 30
TITLE_MAX = 45  # one line in "my conversations"
SENTENCE_END = re.compile(r"[.!?](?=\s|$)")  # "2.75" is a number, not the end of a sentence
TRACE = TypeAdapter(list[TraceEvent])


def conversation_title(first_message: str) -> str:
    """The conversation is named by what the employee wrote first: its first sentence, cut at a word to fit
    one line. Instant, free and never wrong - no model is asked to make up a title."""
    text = " ".join(first_message.split())
    sentence = SENTENCE_END.split(text, maxsplit=1)[0].strip()
    if len(sentence) >= 8:  # "היי." alone says nothing - then the whole message
        text = sentence
    if len(text) <= TITLE_MAX:
        return text or "שיחה"
    cut = text[:TITLE_MAX].rsplit(" ", 1)[0]
    return f"{cut}…"


# The details the employee edited, as the chat note names them
FIELD_NAMES = {
    "first_name": "שם",
    "occupation": "עיסוק",
    "group": "קבוצה",
    "salary": "שכר",
    "deductions": "פנסיה, השתלמות ונקודות זיכוי",
    "children_under_23": "מספר ילדים",
    "current": "הרכב של היום",
}


def not_found() -> ApiError:
    return ApiError(404, "conversation_not_found", "השיחה לא נמצאה")


def stale_revision(expected: int, actual: int) -> ApiError:
    return ApiError(
        409,
        "stale_revision",
        "הפרופיל השתנה בינתיים. טענו מחדש ונסו שוב",
        {"expected": expected, "actual": actual},
    )


def question_out(row: dict[str, Any]) -> RepQuestionOut:
    """A rep_questions row as the API shows it (the answer's time is the row's resolved_at)."""
    answer = row.get("answer")
    return RepQuestionOut.model_validate(
        {
            "id": row["id"],
            "conversation_id": row["conversation_id"],
            "field": row["field"],
            "question": row["question"],
            "context": row.get("context") or {},
            "status": row["status"],
            "answer": {**answer, "answered_at": row["resolved_at"]} if answer else None,
            "created_at": row["created_at"],
        }
    )


def status_for(profile: Profile, open_questions: int, presented: bool = False) -> ConversationStatus:
    if open_questions:
        return ConversationStatus.WAITING_REP
    if missing_fields(profile):
        return ConversationStatus.COLLECTING
    return ConversationStatus.PRESENTED if presented else ConversationStatus.READY


class ConversationService:
    def __init__(self, repo: ConversationRepo, value_of_use: ValueOfUseRepo, bundle: ConfigBundle) -> None:
        self._repo = repo
        self._vou = value_of_use
        self._bundle = bundle

    # ── Access ───────────────────────────────────────────────────────────────

    def owned(self, user: AuthUser, conversation_id: str) -> ConversationRecord:
        try:
            uuid.UUID(conversation_id)
        except ValueError:
            raise not_found() from None  # a malformed id is simply a conversation that doesn't exist
        record = self._repo.get(conversation_id)
        if record is None or record.user_id != user.id:
            raise not_found()
        return record

    # ── Use cases ────────────────────────────────────────────────────────────

    def create(self, user: AuthUser, sample_employee_id: str | None) -> ConversationState:
        profile = Profile()
        if sample_employee_id is not None:
            sample = next((e for e in load_sample_employees() if e.id == sample_employee_id), None)
            if sample is None:
                raise ApiError(
                    404, "sample_employee_not_found", "העובד לדוגמה לא נמצא", {"id": sample_employee_id}
                )
            profile = to_profile(sample, self._bundle)
        if user.first_name and profile.first_name is None:  # the sign-in account's name: a personal chat
            profile = profile.model_copy(update={"first_name": user.first_name})
        record = self._repo.create(user.id, profile, status_for(profile, 0), self._bundle.config_hash)
        return self.state(record, questions=[])  # a new conversation has no rep questions yet

    def mine(self, user: AuthUser) -> list[ConversationListItem]:
        """The signed-in employee's conversations, the most recently active first - to pick up where they
        left off, on any device."""
        items = []
        for row in self._repo.list_for_user(user.id, LIST_LIMIT):
            current = row.profile.current
            car = (
                f"{current.vehicle.commercial_name} ({current.vehicle.key.reg_year})"
                if isinstance(current, CarArrangement)
                else "ויתור על הרכב (אחזקה)"
                if current is not None
                else None
            )
            items.append(
                ConversationListItem(
                    id=row.id,
                    title=conversation_title(row.first_message),
                    status=ConversationStatus(row.status),
                    created_at=datetime.fromisoformat(row.created_at),
                    updated_at=datetime.fromisoformat(row.updated_at),
                    first_name=row.profile.first_name,
                    occupation=row.profile.occupation,
                    current_car=car,
                )
            )
        return items

    def get(self, user: AuthUser, conversation_id: str) -> ConversationState:
        return self.state(self.owned(user, conversation_id))

    def patch_profile(self, user: AuthUser, conversation_id: str, patch: ProfilePatch) -> ConversationState:
        record = self.owned(user, conversation_id)
        current = record.profile
        if patch.expected_revision is not None and patch.expected_revision != current.revision:
            raise stale_revision(patch.expected_revision, current.revision)
        sent = patch.model_dump(exclude_unset=True, exclude_none=True, exclude={"expected_revision"})
        changes: dict[str, Any] = {name: getattr(patch, name) for name in sent}
        if isinstance(changes.get("current"), CarArrangement):
            changes["current"] = self._official_car(changes["current"])
        updated = current.model_copy(update={**changes, "revision": current.revision + 1})
        questions = self._repo.open_questions(record.id)
        # A comparison already on screen is recomputed for the new details at once - the employee who
        # edits a field sees the effect, exactly as when they tell the agent in the chat.
        shown = self._repo.latest_comparison(record.id)
        presented = shown is not None and not missing_fields(updated)  # the comparison stays on screen
        # a new name changes no number - nothing to recompute, nothing to announce
        recompute = presented and any(name != "first_name" for name in changes)
        status = status_for(updated, len(questions), presented=presented)
        saved = self._repo.update_profile(record.id, updated, status, expected_revision=current.revision)
        if saved is None:  # someone else changed the profile between our read and our write
            raise stale_revision(current.revision, current.revision + 1)
        if shown is not None and recompute:
            comparison = rerun(shown, saved.profile, self._bundle)
            option_ids = [r.option.id for r in comparison.results]
            request = {"option_ids": option_ids, "revision": saved.profile.revision, "by": "profile_edit"}
            self._repo.save_comparison(record.id, request, comparison)
            changed = ", ".join(dict.fromkeys(FIELD_NAMES.get(name, name) for name in changes))
            note = f"עדכנת בכרטיס הפרטים: {changed}. ההשוואה חושבה מחדש לפי הפרטים החדשים."
            row = {"role": MessageRole.SYSTEM_EVENT, "content": note, "payload": {}}
            self._repo.add_messages(record.id, [{**row, "created_at": datetime.now(UTC).isoformat()}])
        return self.state(saved, questions)

    def request_rep(self, user: AuthUser, conversation_id: str, option_id: str) -> ConversationState:
        """The employee wants this car: the transport rep is asked to confirm its participation.

        Comparing never asks the rep by itself (testers: "I only wanted to check - why wait for a rep?");
        a comparison on a default participation is shown as an estimate, and the employee asks for the
        car they actually want. One open question per car; a confirmed one is not asked again."""
        record = self.owned(user, conversation_id)
        (result,) = compare(record.profile, self._bundle, [option_id]).results
        if not result.eligibility.eligible:
            raise ApiError(422, "not_eligible", "אי אפשר לבקש אישור לרכב שאינך זכאי/ת לו")
        if result.participation_status != ParticipationStatus.DEFAULT_PENDING:
            raise ApiError(422, "nothing_to_confirm", "ההשתתפות ברכב הזה כבר מאושרת")
        field = f"participation:{option_id}"
        questions = self._repo.open_questions(record.id)
        if all(q["field"] != field for q in questions):
            question = rep_question(field, "participation", car=result.option.label).question
            context = rep_context(record.profile, self._bundle, result.option.label)
            row = self._repo.open_question(record.id, field, question, context, record.profile.revision)
            if row is not None:
                questions.append(row)
                note = f"ביקשת מנציג התחבורה לאשר את ההשתתפות ב-{result.option.label}. ההשוואה תתעדכן כשיענה."
                self._repo.add_messages(
                    record.id,
                    [{"role": MessageRole.SYSTEM_EVENT, "content": note, "payload": {},
                      "created_at": datetime.now(UTC).isoformat()}],
                )  # fmt: skip
        status = status_for(record.profile, len(questions), presented=True)
        if status != record.status:
            self._repo.set_status(record.id, status)
            record = ConversationRecord(record.id, record.user_id, status, record.profile)
        return self.state(record, questions)

    def options(self, user: AuthUser, conversation_id: str) -> Comparison:
        return self._compare(self.owned(user, conversation_id), None)

    def compare(self, user: AuthUser, conversation_id: str, option_ids: list[str]) -> Comparison:
        return self._compare(self.owned(user, conversation_id), option_ids)

    # ── State ────────────────────────────────────────────────────────────────

    def state(
        self, record: ConversationRecord, questions: list[dict[str, Any]] | None = None
    ) -> ConversationState:
        if questions is None:
            questions = self._repo.open_questions(record.id)
        return ConversationState(
            id=record.id,
            status=ConversationStatus(record.status),
            profile=record.profile,
            missing=missing_fields(record.profile),
            messages=[self._message(row) for row in self._repo.messages(record.id)],
            open_questions=[question_out(row) for row in questions],
            latest_comparison=self._repo.latest_comparison(record.id),
        )

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _compare(self, record: ConversationRecord, option_ids: list[str] | None) -> Comparison:
        comparison = compare(record.profile, self._bundle, option_ids)
        request = {"option_ids": option_ids, "revision": record.profile.revision}
        self._repo.save_comparison(record.id, request, comparison)
        status = status_for(record.profile, len(self._repo.open_questions(record.id)), presented=True)
        if status != record.status:
            self._repo.set_status(record.id, status)
        return comparison

    def _official_car(self, arrangement: CarArrangement) -> CarArrangement:
        """Today's car as the server knows it: the vehicle re-read by its key, matched to the company catalog
        by the same key, and the participation the employee stated counted as confirmed."""
        official = self._vou.get(arrangement.vehicle.key)
        if official is None:
            raise ApiError(404, "vehicle_not_found", "הרכב לא נמצא במאגר שווי השימוש לפי המפתח שנמסר")
        key = official.key
        catalog_id = next(
            (
                c.id
                for c in self._bundle.catalog
                if (c.maker_code, c.model_code, c.reg_year, c.vehicle_type_code)
                == (key.maker_code, key.model_code, key.reg_year, key.vehicle_type_code)
            ),
            None,
        )
        stated = arrangement.participation is not None
        return arrangement.model_copy(
            update={
                "vehicle": official,
                "catalog_id": catalog_id,
                "participation_status": ParticipationStatus.CONFIRMED
                if stated
                else ParticipationStatus.UNKNOWN,
            }
        )

    @staticmethod
    def _message(row: dict[str, Any]) -> MessageOut:
        payload = row.get("payload") or {}
        return MessageOut(
            id=row["id"],
            role=row["role"],
            text=row["content"],
            cards=CARDS.validate_python(payload.get("cards", [])),
            trace=TRACE.validate_python(payload.get("trace", [])),
            created_at=datetime.fromisoformat(row["created_at"]),
        )
