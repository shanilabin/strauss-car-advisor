"""Contract stubs (task A2.1).

Every endpoint returns realistic, schema-valid data so the frontend can be built in parallel.
The calculation results are a fixed fixture (stub_data.json); the catalog, occupations, sample
employees and config summary are read from the real config bundle. Each piece is replaced by the
real implementation in later tasks (A2.4, A3.4, A4.x) without changing the contract.
"""

import json
import uuid
from datetime import UTC, datetime
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from typing import Any

from strauss import ENGINE_VERSION
from strauss.agent.schemas import AgentReply, ComparisonCard, OptionsCard, RepPendingCard, TraceEvent
from strauss.config.loader import config_hash, load_catalog, load_rules, load_sample_employees
from strauss.config.models import CatalogCar, SampleCurrentCar
from strauss.domain.models import (
    CalculationContext,
    CarArrangement,
    Comparison,
    Deductions,
    NetBreakdown,
    OptionResult,
    ParticipationStatus,
    Profile,
    Vehicle,
    VehicleKey,
    WaiverArrangement,
)
from strauss.http.errors import ApiError
from strauss.http.schemas import (
    ConversationState,
    ConversationStatus,
    MessageOut,
    MessageRole,
    ProfilePatch,
    RepAnswer,
    RepAnswerRequest,
    RepQuestionOut,
    RepQuestionStatus,
)

STUB_FILE = Path(__file__).with_name("stub_data.json")


@lru_cache
def _data() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(STUB_FILE.read_text(encoding="utf-8"))
    return data


def _now() -> datetime:
    return datetime.now(UTC)


def calculation_context() -> CalculationContext:
    rules = load_rules()
    return CalculationContext(
        payroll_tax_year=rules.net_method.tax_year,
        value_of_use_tax_year=rules.value_of_use.tax_year,
        config_version=rules.version,
        config_hash=config_hash(),
        engine_version=ENGINE_VERSION,
    )


# ── Vehicles (real catalog data, no Tax Authority DB yet) ────────────────────


def catalog_vehicle(car: CatalogCar) -> Vehicle:
    return Vehicle(
        key=VehicleKey(
            tax_year=load_rules().value_of_use.tax_year,
            reg_year=car.reg_year,
            vehicle_type_code=car.vehicle_type_code,
            maker_code=car.maker_code,
            model_code=car.model_code,
        ),
        maker_name=car.maker_name,
        commercial_name=car.commercial_name,
        model_desc=car.model_desc,
        drive=car.drive,
        list_price=car.list_price,
        value_of_use=car.value_of_use,
    )


def search_vehicles(query: str, reg_year: int | None) -> list[Vehicle]:
    needle = query.strip().casefold()
    return [
        catalog_vehicle(car)
        for car in load_catalog()
        if needle in car.commercial_name.casefold() and (reg_year is None or car.reg_year == reg_year)
    ][:5]


def value_of_use(key: VehicleKey) -> Vehicle:
    for car in load_catalog():
        vehicle = catalog_vehicle(car)
        if vehicle.key == key:
            return vehicle
    raise ApiError(404, "vehicle_not_found", "הרכב לא נמצא במאגר שווי השימוש לפי המפתח שנמסר")


# ── Comparisons ──────────────────────────────────────────────────────────────


def _best_option_id(results: list[OptionResult]) -> str | None:
    eligible = [r for r in results if r.eligibility.eligible and r.delta is not None]
    best = max(eligible, key=lambda r: r.delta or Decimal(0), default=None)
    return best.option.id if best else None


@lru_cache
def profile() -> Profile:
    return Profile.model_validate(_data()["profile"])


@lru_cache
def options_comparison() -> Comparison:
    results = [OptionResult.model_validate(r) for r in _data()["results"]]
    return Comparison(
        id="cmp-stub-options",
        context=calculation_context(),
        profile_snapshot=profile(),
        today=NetBreakdown.model_validate(_data()["today"]),
        results=results,
        best_option_id=_best_option_id(results),
    )


def compare(option_ids: list[str] | None) -> Comparison:
    full = options_comparison()
    if option_ids is None:
        return full
    known = {r.option.id for r in full.results}
    unknown = [i for i in option_ids if i not in known]
    if unknown:
        raise ApiError(404, "option_not_found", "חלק מהחלופות שנבחרו לא קיימות", {"option_ids": unknown})
    chosen = [r for r in full.results if r.option.id in option_ids]
    return full.model_copy(
        update={"id": "cmp-stub-selected", "results": chosen, "best_option_id": _best_option_id(chosen)}
    )


# ── Conversations ────────────────────────────────────────────────────────────


def _messages(comparison: Comparison) -> list[MessageOut]:
    messages = [MessageOut.model_validate(m) for m in _data()["messages"]]
    reply = messages[-1].model_copy(update={"cards": [ComparisonCard(comparison=comparison)]})
    return [*messages[:-1], reply]


def _rep_question(conversation_id: str) -> RepQuestionOut:
    return RepQuestionOut.model_validate({**_data()["rep_question"], "conversation_id": conversation_id})


def conversation(conversation_id: str) -> ConversationState:
    comparison = compare(["CAR-10"])
    return ConversationState(
        id=conversation_id,
        status=ConversationStatus.WAITING_REP,
        profile=profile(),
        missing=[],
        messages=_messages(comparison),
        open_questions=[_rep_question(conversation_id)],
        latest_comparison=comparison,
    )


def _sample_profile(employee_id: str) -> Profile:
    emp = next((e for e in load_sample_employees() if e.id == employee_id), None)
    if emp is None:
        raise ApiError(404, "sample_employee_not_found", "העובד לדוגמה לא נמצא", {"id": employee_id})
    current: CarArrangement | WaiverArrangement
    if isinstance(emp.current, SampleCurrentCar):
        car = next(c for c in load_catalog() if c.id == emp.current.catalog_id)
        current = CarArrangement(
            vehicle=catalog_vehicle(car),
            catalog_id=car.id,
            participation=emp.current.participation,
            participation_status=ParticipationStatus.CONFIRMED,
        )
    else:
        current = WaiverArrangement(maintenance=emp.current.maintenance)
    return Profile(
        occupation=emp.occupation,
        group=emp.group,
        salary=emp.salary,
        deductions=Deductions(
            pension_pct=emp.deductions.pension_pct,
            study_fund_pct=emp.deductions.study_fund_pct,
            credit_points=emp.deductions.credit_points,
        ),
        children_under_23=emp.children_under_23,
        current=current,
    )


def create_conversation(sample_employee_id: str | None) -> ConversationState:
    return ConversationState(
        id=str(uuid.uuid4()),
        status=ConversationStatus.COLLECTING,
        profile=_sample_profile(sample_employee_id) if sample_employee_id else Profile(),
    )


def patch_profile(conversation_id: str, patch: ProfilePatch) -> ConversationState:
    state = conversation(conversation_id)
    if patch.expected_revision is not None and patch.expected_revision != state.profile.revision:
        raise ApiError(
            409,
            "stale_revision",
            "הפרופיל השתנה בינתיים. טענו מחדש ונסו שוב",
            {"expected": patch.expected_revision, "actual": state.profile.revision},
        )
    changes = patch.model_dump(exclude_unset=True, exclude_none=True, exclude={"expected_revision"})
    updated = state.profile.model_copy(
        update={**{k: getattr(patch, k) for k in changes}, "revision": state.profile.revision + 1}
    )
    return state.model_copy(update={"profile": updated})


def agent_turn(conversation_id: str, text: str) -> tuple[AgentReply, list[TraceEvent], ConversationState]:
    state = conversation(conversation_id)
    question = state.open_questions[0]
    reply = AgentReply(
        text=(
            "הנה כל החלופות שאת זכאית להן, מהמשתלמת ביותר. "
            "את ההשתתפות ב-ATTO 3 עוד לא אישר נציג התחבורה, ושאלתי אותו."
        ),
        quick_replies=["השווה ל-ATTO 3", "מה אם אוותר על הרכב?", "תקנו את השכר שלי"],
        cards=[
            OptionsCard(comparison=options_comparison()),
            RepPendingCard(question_id=question.id, field=question.field, question=question.question),
        ],
    )
    now = _now()
    trace = [
        TraceEvent(kind="tool_call", name="list_options", data={}, at=now),
        TraceEvent(kind="tool_result", name="list_options", data={"options": 3, "eligible": 2}, at=now),
        TraceEvent(kind="tool_call", name="ask_representative", data={"field": question.field}, at=now),
        TraceEvent(kind="guard", name="number_guard", data={"passed": True}, at=now),
    ]
    user_message = MessageOut(id=str(uuid.uuid4()), role=MessageRole.USER, text=text, created_at=now)
    bot_message = MessageOut(
        id=str(uuid.uuid4()), role=MessageRole.ASSISTANT, text=reply.text, cards=reply.cards, created_at=now
    )
    state = state.model_copy(update={"messages": [*state.messages, user_message, bot_message]})
    return reply, trace, state


# ── Rep ──────────────────────────────────────────────────────────────────────


class RepStubStore:
    """In-memory answers, so the stub already behaves like the real atomic OPEN -> ANSWERED transition."""

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
            value=request.value, effective_from=request.effective_from, answered_at=_now()
        )
        return self._with_answer(question)

    def _with_answer(self, question: RepQuestionOut) -> RepQuestionOut:
        answer = self._answers.get(question.id)
        if answer is None:
            return question
        return question.model_copy(update={"status": RepQuestionStatus.ANSWERED, "answer": answer})


rep_store = RepStubStore()
