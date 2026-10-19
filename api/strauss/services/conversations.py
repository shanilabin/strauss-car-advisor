"""Conversation use cases without the agent: create, read, correct the profile, list options, compare.

Every call checks that the conversation belongs to the caller; a conversation that isn't theirs is
"not found" (its existence isn't revealed). Facts the employee can't vouch for are re-established here:
today's car is re-read from the Tax Authority data by its key.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import TypeAdapter

from strauss.agent.schemas import Card, TraceEvent
from strauss.config.bundle import ConfigBundle
from strauss.config.loader import load_sample_employees
from strauss.config.samples import to_profile
from strauss.domain.compare import compare, rerun
from strauss.domain.missing import missing_fields
from strauss.domain.models import CarArrangement, Comparison, Profile
from strauss.errors import ApiError
from strauss.http.schemas import (
    ConversationState,
    ConversationStatus,
    MessageOut,
    MessageRole,
    ProfilePatch,
    RepQuestionOut,
)
from strauss.ports.repositories import AuthUser, ConversationRecord, ConversationRepo, ValueOfUseRepo

CARDS = TypeAdapter(list[Card])
TRACE = TypeAdapter(list[TraceEvent])
# The details the employee edited, as the chat note names them
FIELD_NAMES = {
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
        record = self._repo.create(user.id, profile, status_for(profile, 0), self._bundle.config_hash)
        return self.state(record, questions=[])  # a new conversation has no rep questions yet

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
        recompute = shown is not None and not missing_fields(updated)
        status = status_for(updated, len(questions), presented=recompute)
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
        official = self._vou.get(arrangement.vehicle.key)
        if official is None:
            raise ApiError(404, "vehicle_not_found", "הרכב לא נמצא במאגר שווי השימוש לפי המפתח שנמסר")
        return arrangement.model_copy(update={"vehicle": official})

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
