from fastapi import APIRouter

from strauss.domain.models import Comparison
from strauss.http import stubs
from strauss.http.auth import CallerDep
from strauss.http.errors import ERROR_RESPONSES
from strauss.http.schemas import (
    CompareRequest,
    ConversationState,
    CreateConversationRequest,
    ProfilePatch,
    SendMessageRequest,
    TurnResponse,
)

router = APIRouter(prefix="/v1/conversations", tags=["conversations"], responses=ERROR_RESPONSES)


@router.post("", status_code=201)
def create_conversation(body: CreateConversationRequest, _: CallerDep) -> ConversationState:
    """Start a conversation, optionally pre-filled from a sample employee (demo)."""
    return stubs.create_conversation(body.sample_employee_id)


@router.get("/{conversation_id}")
def get_conversation(conversation_id: str, _: CallerDep) -> ConversationState:
    """Full state: profile, missing fields, messages, open rep questions, latest comparison."""
    return stubs.conversation(conversation_id)


@router.post("/{conversation_id}/messages")
def send_message(conversation_id: str, body: SendMessageRequest, _: CallerDep) -> TurnResponse:
    """One agent turn. The reply text is words only; numbers arrive inside cards."""
    reply, trace, state = stubs.agent_turn(conversation_id, body.text)
    return TurnResponse(reply=reply, trace=trace, state=state)


@router.patch("/{conversation_id}/profile")
def patch_profile(conversation_id: str, body: ProfilePatch, _: CallerDep) -> ConversationState:
    """Correct profile data. Send expected_revision to reject stale updates with 409."""
    return stubs.patch_profile(conversation_id, body)


@router.get("/{conversation_id}/options")
def list_options(conversation_id: str, _: CallerDep) -> Comparison:
    """Every alternative versus today, ranked by net impact (ineligible ones carry the reason only)."""
    return stubs.options_comparison()


@router.post("/{conversation_id}/compare")
def compare_options(conversation_id: str, body: CompareRequest, _: CallerDep) -> Comparison:
    """Today versus the chosen alternatives."""
    return stubs.compare(body.option_ids)
