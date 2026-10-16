from typing import Annotated

from fastapi import APIRouter, Query

from strauss.http.auth import RepDep
from strauss.http.deps import RepServiceDep
from strauss.http.errors import ERROR_RESPONSES
from strauss.http.schemas import RepAnswerRequest, RepQuestionOut, RepQuestionStatus

router = APIRouter(prefix="/v1/rep", tags=["rep"], responses=ERROR_RESPONSES)


@router.get("/questions")
def list_questions(
    _: RepDep,
    service: RepServiceDep,
    status: Annotated[RepQuestionStatus | None, Query(description="Omit for every question")] = None,
) -> list[RepQuestionOut]:
    """The rep's queue (send status=OPEN), newest first: each question with the minimum context needed to
    answer it - occupation, group, the cars involved. Never salary, never the chat."""
    return service.questions(status)


@router.post("/questions/{question_id}/answer")
def answer_question(
    question_id: str, body: RepAnswerRequest, rep: RepDep, service: RepServiceDep
) -> RepQuestionOut:
    """Answer once (atomic): a second answer returns 409 'already_answered'. A participation is an amount
    ("350"), an occupation is a name from the table - anything else is 422 'invalid_answer'. The answer is
    applied to that field of the employee's profile, and the conversation gets the updated comparison."""
    return service.answer(rep, question_id, body)
