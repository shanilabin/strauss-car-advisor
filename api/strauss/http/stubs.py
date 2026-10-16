"""Rep stub (task A2.1) - the last piece still served from a fixture; replaced by the real rep flow in A4.4.

The store keeps answers in memory, so it already behaves like the real atomic OPEN -> ANSWERED transition.
"""

import json
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from strauss.http.errors import ApiError
from strauss.http.schemas import RepAnswer, RepAnswerRequest, RepQuestionOut, RepQuestionStatus

STUB_FILE = Path(__file__).with_name("stub_data.json")


@lru_cache
def _data() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(STUB_FILE.read_text(encoding="utf-8"))
    return data


def _rep_question(conversation_id: str) -> RepQuestionOut:
    return RepQuestionOut.model_validate({**_data()["rep_question"], "conversation_id": conversation_id})


class RepStubStore:
    def __init__(self) -> None:
        self._answers: dict[str, RepAnswer] = {}

    def questions(self, status: RepQuestionStatus | None) -> list[RepQuestionOut]:
        question = self._with_answer(_rep_question("stub-conversation"))
        return [question] if status is None or question.status == status else []

    def answer(self, question_id: str, request: RepAnswerRequest) -> RepQuestionOut:
        question = _rep_question("stub-conversation")
        if question_id != question.id:
            raise ApiError(404, "question_not_found", "השאלה לא נמצאה")
        if question_id in self._answers:
            raise ApiError(409, "already_answered", "השאלה כבר נענתה")
        self._answers[question_id] = RepAnswer(
            value=request.value, effective_from=request.effective_from, answered_at=datetime.now(UTC)
        )
        return self._with_answer(question)

    def _with_answer(self, question: RepQuestionOut) -> RepQuestionOut:
        answer = self._answers.get(question.id)
        if answer is None:
            return question
        return question.model_copy(update={"status": RepQuestionStatus.ANSWERED, "answer": answer})


rep_store = RepStubStore()
