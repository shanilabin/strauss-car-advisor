from fastapi import APIRouter

from strauss.domain.models import Comparison
from strauss.http.auth import UserDep
from strauss.http.deps import ConversationServiceDep, TurnServiceDep
from strauss.http.errors import ERROR_RESPONSES
from strauss.http.schemas import (
    CompareRequest,
    ConversationListItem,
    ConversationState,
    CreateConversationRequest,
    ProfilePatch,
    RepRequest,
    SendMessageRequest,
    TurnResponse,
)

router = APIRouter(prefix="/v1/conversations", tags=["conversations"], responses=ERROR_RESPONSES)


@router.post("", status_code=201)
def create_conversation(
    body: CreateConversationRequest, user: UserDep, service: ConversationServiceDep
) -> ConversationState:
    """Start a conversation for the signed-in user, optionally pre-filled from a sample employee (demo)."""
    return service.create(user, body.sample_employee_id)


@router.get("")
def list_conversations(user: UserDep, service: ConversationServiceDep) -> list[ConversationListItem]:
    """The signed-in employee's conversations, most recently active first (up to 30)."""
    return service.mine(user)


@router.get("/{conversation_id}")
def get_conversation(
    conversation_id: str, user: UserDep, service: ConversationServiceDep
) -> ConversationState:
    """Full state: profile, missing fields, messages, open rep questions, latest comparison. Owner only."""
    return service.get(user, conversation_id)


@router.post("/{conversation_id}/messages")
def send_message(
    conversation_id: str, body: SendMessageRequest, user: UserDep, service: TurnServiceDep
) -> TurnResponse:
    """One agent turn. The reply text is words only; numbers arrive inside cards built by the engine.
    9-digit ID numbers are masked before the model or the database sees them. When no model can answer:
    503 'agent_unavailable' with details.mode = "form" (nothing is saved) - the UI switches to the form."""
    return service.send(user, conversation_id, body.text)


@router.patch("/{conversation_id}/profile")
def patch_profile(
    conversation_id: str, body: ProfilePatch, user: UserDep, service: ConversationServiceDep
) -> ConversationState:
    """Correct profile data. Send expected_revision to reject stale updates with 409. Today's car is re-read
    from the Tax Authority data by its key."""
    return service.patch_profile(user, conversation_id, body)


@router.get("/{conversation_id}/options")
def list_options(conversation_id: str, user: UserDep, service: ConversationServiceDep) -> Comparison:
    """Every alternative versus today, ranked by net impact (ineligible ones carry the reason only).
    An incomplete profile returns 422 'incomplete_profile' with the questions to ask."""
    return service.options(user, conversation_id)


@router.post("/{conversation_id}/rep-requests")
def request_rep(
    conversation_id: str, body: RepRequest, user: UserDep, service: ConversationServiceDep
) -> ConversationState:
    """The employee wants this car: ask the transport rep to confirm its participation (one open question
    per car). 422 nothing_to_confirm if already confirmed, not_eligible for a car they may not take."""
    return service.request_rep(user, conversation_id, body.option_id)


@router.post("/{conversation_id}/compare")
def compare_options(
    conversation_id: str, body: CompareRequest, user: UserDep, service: ConversationServiceDep
) -> Comparison:
    """Today versus the chosen alternatives. Saved for audit with the config hash and engine version."""
    return service.compare(user, conversation_id, body.option_ids)
