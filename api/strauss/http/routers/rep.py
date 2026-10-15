from typing import Annotated

from fastapi import APIRouter, Query

from strauss.http import stubs
from strauss.http.auth import RepDep
from strauss.http.errors import ERROR_RESPONSES
from strauss.http.schemas import RepAnswerRequest, RepQuestionOut, RepQuestionStatus

router = APIRouter(prefix="/v1/rep", tags=["rep"], responses=ERROR_RESPONSES)


@router.get("/questions")
def list_questions(
    _: RepDep,
    status: Annotated[RepQuestionStatus | None, Query(description="Omit for every question")] = None,
) -> list[RepQuestionOut]:
    """The rep's queue (send status=OPEN): each question with the minimum context needed to answer it."""
    return stubs.rep_store.questions(status)


@router.post("/questions/{question_id}/answer")
def answer_question(question_id: str, body: RepAnswerRequest, _: RepDep) -> RepQuestionOut:
    """Answer once. A second answer to the same question returns 409; the conversation resumes once."""
    return stubs.rep_store.answer(question_id, body)
