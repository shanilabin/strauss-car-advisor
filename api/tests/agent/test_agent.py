"""The agent with a scripted model (PydanticAI FunctionModel): real tools, real engine, real data - no
network, no keys, no cost. The script plays the LLM's part: which tools to call and with what."""

import json
import re
from collections.abc import Iterator
from typing import Any

import pytest
from pydantic_ai.messages import (
    ModelMessage,
    ModelRequest,
    ModelResponse,
    RetryPromptPart,
    ToolCallPart,
    ToolReturnPart,
)
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.google import GoogleModel

from strauss.agent.agent import build_agent, state_block, to_reply
from strauss.agent.deps import AgentDeps
from strauss.agent.models_chain import AgentUnavailable, build_model
from strauss.agent.schemas import ComparisonCard, MissingCard, OptionsCard
from strauss.config.loader import load_bundle, load_sample_employees
from strauss.config.samples import to_profile
from strauss.domain.models import CarArrangement, Profile, WaiverArrangement
from strauss.settings import Settings
from tests.conftest import _tax_authority_repo

BUNDLE = load_bundle()
COROLLA_CROSS_2025 = {"reg_year": 2025, "vehicle_type_code": 1, "maker_code": "00413", "model_code": "00296"}
FINAL = (
    "final_result",
    {"text": "הנה ההשוואה. הנטו שלך עולה במעבר לרכב החשמלי.", "quick_replies": ["מה עם ויתור?"]},
)
MONEY = re.compile(r"\b(11,?032|11,?693|661|3,?130|4,?070|440)\b")  # Noa's numbers must never reach the model


def deps_for(profile: Profile | None = None) -> AgentDeps:
    return AgentDeps(profile=profile or Profile(), bundle=BUNDLE, value_of_use=_tax_authority_repo())


def scripted(*steps: tuple[str, dict[str, Any]]) -> FunctionModel:
    """Each step is one model response: a tool call (name, args). The last should be FINAL."""
    queue: Iterator[tuple[str, dict[str, Any]]] = iter(steps)

    def respond(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        name, args = next(queue)
        return ModelResponse(parts=[ToolCallPart(name, args)])

    return FunctionModel(respond)


def run(deps: AgentDeps, *steps: tuple[str, dict[str, Any]], prompt: str = "אני שוקלת לעבור לחשמלי") -> Any:
    return build_agent(scripted(*steps)).run_sync(prompt, deps=deps)


def tool_returns(result: Any) -> list[ToolReturnPart]:
    return [
        part
        for message in result.all_messages()
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]


# ── A full turn, from nothing to a comparison ────────────────────────────────


def test_noa_from_scratch_to_a_comparison_card() -> None:
    deps = deps_for()
    result = run(
        deps,
        ("update_profile", {"occupation": "מנהל/ת מוצר", "base_salary": 18500, "pension_pct": 6,
                            "study_fund_pct": 2.5, "credit_points": 2.75, "children_under_23": 2}),
        ("find_vehicle", {"query": "corolla cross", "reg_year": 2025}),
        ("set_current_car", {**COROLLA_CROSS_2025, "participation": 300}),
        ("compare", {"option_ids": ["CAR-10"]}),
        FINAL,
    )  # fmt: skip
    reply = to_reply(result.output, deps)
    (card,) = reply.cards
    assert isinstance(card, ComparisonCard)
    (atto,) = card.comparison.results
    assert (atto.net_today, atto.net_option, atto.delta) == (11032, 11693, 661)  # the engine's numbers
    assert deps.turn.profile_changed and isinstance(deps.profile.current, CarArrangement)
    assert deps.profile.current.catalog_id == "CAR-09"  # matched to the catalog by its full key


def test_numbers_never_reach_the_model() -> None:
    """Every tool result the model reads is words only - numbers travel in cards to the screen."""
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(deps, ("list_options", {}), ("compare", {"option_ids": ["CAR-10", "waiver"]}), FINAL)
    returned = " ".join(str(part.content) for part in tool_returns(result))
    assert not MONEY.search(returned), MONEY.search(returned)
    assert '"net_change": "up"' in json.dumps([p.content for p in tool_returns(result)], ensure_ascii=False)
    assert [type(c) for c in deps.turn.cards] == [OptionsCard, ComparisonCard]


def test_every_tool_call_is_in_the_trace() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    run(deps, ("check_eligibility", {"option_id": "CAR-14"}), ("list_options", {}), FINAL)
    events = [(e.kind, e.name) for e in deps.turn.trace]
    assert events == [
        ("tool_call", "check_eligibility"),
        ("tool_result", "check_eligibility"),
        ("tool_call", "list_options"),
        ("tool_result", "list_options"),
    ]
    assert "קבוצה ד" in deps.turn.trace[1].data["summary"]  # Tesla: higher group, in words


# ── Tools refuse to guess ────────────────────────────────────────────────────


def test_pension_without_credit_points_is_sent_back_to_ask() -> None:
    deps = deps_for()
    result = run(
        deps,
        ("update_profile", {"pension_pct": 6}),
        ("update_profile", {"pension_pct": 6, "credit_points": 2.25}),
        FINAL,
    )
    retries = [
        part
        for message in result.all_messages()
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, RetryPromptPart)
    ]
    assert retries and "credit_points" in str(retries[0].content)
    assert deps.profile.deductions is not None and deps.profile.deductions.credit_points == 2.25


def test_a_car_key_that_isnt_in_the_tax_authority_data_is_refused() -> None:
    deps = deps_for()
    run(
        deps,
        ("set_current_car", {**COROLLA_CROSS_2025, "model_code": "99999"}),
        ("set_current_car", COROLLA_CROSS_2025),
        FINAL,
    )
    assert isinstance(deps.profile.current, CarArrangement)
    assert deps.profile.current.vehicle.value_of_use == 4070  # from the data, never from the model


def test_a_broad_search_asks_for_more_detail_instead_of_a_cut_list() -> None:
    deps = deps_for()
    result = run(deps, ("find_vehicle", {"query": "טויוטה"}), FINAL)
    (returned,) = tool_returns(result)[:1]
    assert returned.content == {
        "too_many": True,
        "hint": "ask for a more specific model name or the registration year",
    }


def test_options_on_an_incomplete_profile_show_what_is_missing() -> None:
    deps = deps_for(Profile(occupation="מנהל/ת מוצר"))
    result = run(deps, ("list_options", {}), FINAL)
    (card,) = deps.turn.cards
    assert isinstance(card, MissingCard)
    assert tool_returns(result)[0].content["incomplete"] is True


def test_waiver_today_takes_the_maintenance_from_the_occupation_table() -> None:
    deps = deps_for()
    run(deps, ("update_profile", {"occupation": "מפתח/ת תוכנה", "current_is_waiver": True}), FINAL)
    assert deps.profile.current == WaiverArrangement(maintenance=1500)


def test_the_rep_question_carries_no_salary() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    run(deps, ("ask_representative", {"field": "participation:CAR-10", "question": "מה ההשתתפות?"}), FINAL)
    (request,) = deps.turn.rep_requests
    assert request.field == "participation:CAR-10"
    assert "18500" not in json.dumps(request.context) and "salary" not in request.context


# ── The state block the model reads every turn ───────────────────────────────


def test_state_block_lists_what_is_missing_and_the_occupations() -> None:
    block = state_block(deps_for(Profile(occupation="מנהל/ת מוצר")))
    assert "salary.base" in block and "מנהל/ת פיתוח" in block
    assert "revision" not in block and "confirmed_participation" not in block


def test_state_block_names_todays_car_instead_of_its_codes() -> None:
    noa = to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE)
    block = state_block(deps_for(noa))
    assert "COROLLA CROSS (2025)" in block and "00413" not in block


# ── Model chain ──────────────────────────────────────────────────────────────


def test_no_keys_means_the_agent_is_unavailable() -> None:
    with pytest.raises(AgentUnavailable):
        build_model(Settings(gemini_api_key="", openrouter_api_key="", llm_chain="google:gemini-2.5-flash"))


def test_one_key_gives_one_model_two_keys_give_a_fallback_chain() -> None:
    chain = "google:gemini-2.5-flash,openrouter:meta-llama/llama-3.3-70b-instruct:free"
    single = build_model(Settings(gemini_api_key="g", openrouter_api_key="", llm_chain=chain))
    assert isinstance(single, GoogleModel)
    both = build_model(Settings(gemini_api_key="g", openrouter_api_key="o", llm_chain=chain))
    assert isinstance(both, FallbackModel)


# ── Review follow-ups ────────────────────────────────────────────────────────


def test_an_almost_right_occupation_is_sent_back_with_the_listed_name() -> None:
    deps = deps_for()
    result = run(
        deps,
        ("update_profile", {"occupation": "מנהלת מוצר"}),
        ("update_profile", {"occupation": "מנהל/ת מוצר"}),
        FINAL,
    )
    retry = next(
        part
        for message in result.all_messages()
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, RetryPromptPart)
    )
    assert "מנהל/ת מוצר" in str(retry.content)
    assert deps.profile.occupation == "מנהל/ת מוצר"


def test_a_really_unlisted_occupation_is_saved_when_flagged() -> None:
    deps = deps_for()
    run(deps, ("update_profile", {"occupation": "אסטרונאוט/ית", "occupation_not_in_list": True}), FINAL)
    assert deps.profile.occupation == "אסטרונאוט/ית"


def test_the_rep_question_may_not_carry_salary_details() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    run(
        deps,
        (
            "ask_representative",
            {"field": "participation:CAR-10", "question": "נועה מרוויחה 18,500, מה ההשתתפות?"},
        ),
        ("ask_representative", {"field": "participation:CAR-10", "question": "מה ההשתתפות ב-ATTO 3?"}),
        ("ask_representative", {"field": "participation:CAR-10", "question": "מה ההשתתפות ב-ATTO 3?"}),
        FINAL,
    )
    assert [r.question for r in deps.turn.rep_requests] == ["מה ההשתתפות ב-ATTO 3?"]  # once, no salary


def test_personal_amounts_are_redacted_in_the_trace() -> None:
    deps = deps_for()
    run(deps, ("update_profile", {"occupation": "מנהל/ת מוצר", "base_salary": 18500}), FINAL)
    call = deps.turn.trace[0]
    assert call.data == {"occupation": "מנהל/ת מוצר", "base_salary": "(נשמר)"}
    assert deps.profile.salary is not None and deps.profile.salary.base == 18500  # saved, just not shown
