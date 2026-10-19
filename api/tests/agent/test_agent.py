"""The agent with a scripted model (PydanticAI FunctionModel): real tools, real engine, real data - no
network, no keys, no cost. The script plays the LLM's part: which tools to call and with what."""

import json
import re
from typing import Any

import pytest
from pydantic_ai.messages import (
    ModelRequest,
    ToolReturnPart,
)
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel

from strauss.agent.agent import build_agent, employee_replies, state_block, to_reply
from strauss.agent.deps import AgentDeps
from strauss.agent.guard import FALLBACK_WITH_CARDS
from strauss.agent.models_chain import AgentUnavailable, build_model
from strauss.agent.schemas import ComparisonCard, MissingCard, OptionsCard
from strauss.config.loader import load_bundle, load_sample_employees
from strauss.config.samples import to_profile
from strauss.domain.models import CarArrangement, Profile, WaiverArrangement
from strauss.settings import Settings
from tests.conftest import _tax_authority_repo
from tests.scripted import say, scripted

BUNDLE = load_bundle()
COROLLA_CROSS_2025 = {"reg_year": 2025, "vehicle_type_code": 1, "maker_code": "00413", "model_code": "00296"}
FINAL = say("הנה ההשוואה. הנטו שלך עולה במעבר לרכב החשמלי.", "מה עם ויתור?")
MONEY = re.compile(r"\b(11,?032|11,?693|661|3,?130|4,?070|440)\b")  # Noa's numbers must never reach the model


def deps_for(profile: Profile | None = None) -> AgentDeps:
    return AgentDeps(profile=profile or Profile(), bundle=BUNDLE, value_of_use=_tax_authority_repo())


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
        ("guard", "number_guard"),
    ]
    assert "קבוצה ד" in deps.turn.trace[1].data["summary"]  # Tesla: higher group, in words


# ── Tools refuse to guess ────────────────────────────────────────────────────


def test_pension_without_credit_points_is_reported_and_asked_for() -> None:
    deps = deps_for()
    result = run(
        deps,
        ("update_profile", {"pension_pct": 6}),
        ("update_profile", {"pension_pct": 6, "credit_points": 2.25}),
        FINAL,
    )
    first = tool_returns(result)[0].content
    assert "credit_points" in first["not_saved"]["deductions"]
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
    result = run(deps, ("find_vehicle", {"query": "4runner", "reg_year": 2025}), FINAL)
    returned = tool_returns(result)[0].content
    assert returned["too_many"] is True and returned["names"] == ["4RUNNER", "4RUNNER HYBRID"]
    assert "payslip_value_of_use" in returned["hint"]


def test_of_many_variants_the_company_catalogs_one_comes_first() -> None:
    deps = deps_for()
    result = run(deps, ("find_vehicle", {"query": "corolla cross", "reg_year": 2025}), FINAL)
    returned = tool_returns(result)[0].content
    (candidate,) = returned["candidates"]  # 30 variants in the data, one in the catalog (Noa's CAR-09)
    assert candidate["key"]["model_code"] == COROLLA_CROSS_2025["model_code"]
    assert "catalog" in returned["hint"]


def test_the_payslip_value_of_use_pins_down_the_variant() -> None:
    deps = deps_for()
    result = run(
        deps,
        ("find_vehicle", {"query": "corolla cross", "reg_year": 2025, "payslip_value_of_use": 4750}),
        ("find_vehicle", {"query": "corolla cross", "reg_year": 2025, "payslip_value_of_use": 1}),
        FINAL,
    )
    pinned, nothing = (r.content for r in tool_returns(result)[:2])
    assert [c["key"]["model_code"] for c in pinned["candidates"]] == ["00412"]
    assert nothing["candidates"] == []
    assert not MONEY.search(str(pinned)) and "4750" not in str(pinned)  # the value itself isn't echoed


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


def test_the_rep_question_is_a_fixed_template_without_salary() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    run(deps, ("ask_representative", {"field": "participation:CAR-10"}), FINAL)
    (request,) = deps.turn.rep_requests
    assert request.field == "participation:CAR-10"
    assert request.question == "מה סכום ההשתתפות של העובד ב-ATTO 3 (2025), וממתי הוא בתוקף?"
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
        build_model(Settings(gemini_api_key="", openrouter_api_key="", llm_chain="google:gemini-3.8-flash"))


def test_one_key_gives_one_model_two_keys_give_a_fallback_chain() -> None:
    chain = "google:gemini-3.8-flash,openrouter:meta-llama/llama-3.3-70b-instruct:free"
    single = build_model(Settings(gemini_api_key="g", openrouter_api_key="", llm_chain=chain))
    assert isinstance(single, GoogleModel)
    both = build_model(Settings(gemini_api_key="g", openrouter_api_key="o", llm_chain=chain))
    assert isinstance(both, FallbackModel)


def test_the_default_chain_tries_several_gemini_models_then_groq_without_sdk_retries() -> None:
    chain = build_model(Settings(gemini_api_key="g", groq_api_key="q", openrouter_api_key=""))
    assert isinstance(chain, FallbackModel)
    names = [m.model_name for m in chain.models]
    assert sum(name.startswith("gemini") for name in names) >= 3
    # Groq limits tokens per minute per model, so several Groq models follow the Gemini ones
    groq = [m for m in chain.models if isinstance(m, OpenAIChatModel)]
    assert len(groq) >= 2 and names.index(groq[0].model_name) > 2
    assert all(m.client.max_retries == 0 for m in groq)  # hand over at once


# ── Review follow-ups ────────────────────────────────────────────────────────


def test_an_almost_right_occupation_comes_back_with_the_listed_name() -> None:
    deps = deps_for()
    result = run(
        deps,
        ("update_profile", {"occupation": "מנהלת מוצר"}),
        ("update_profile", {"occupation": "מנהל/ת מוצר"}),
        FINAL,
    )
    first = tool_returns(result)[0].content
    assert "מנהל/ת מוצר" in first["not_saved"]["occupation"]
    assert deps.profile.occupation == "מנהל/ת מוצר"


def test_an_unlisted_occupation_never_blocks_the_salary() -> None:
    """Found on the live site: "אני מנתחת מערכות, ומרוויחה 15000" ended in "sorry, I couldn't complete".
    The salary is saved, and the occupation comes back as a question - the turn goes on."""
    deps = deps_for()
    result = run(
        deps,
        ("update_profile", {"occupation": "מנתח/ת מערכות", "base_salary": 15000}),
        say("שמרתי את השכר. איזה מהתפקידים ברשימה הכי קרוב לשלך?"),
    )
    returned = tool_returns(result)[0].content
    assert returned["saved"] == ["salary"] and "occupation" in returned["not_saved"]
    assert deps.profile.salary is not None and deps.profile.salary.base == 15000
    assert deps.profile.occupation is None and deps.turn.profile_changed


def test_a_really_unlisted_occupation_is_saved_when_flagged() -> None:
    deps = deps_for()
    run(deps, ("update_profile", {"occupation": "אסטרונאוט/ית", "occupation_not_in_list": True}), FINAL)
    assert deps.profile.occupation == "אסטרונאוט/ית"


def test_the_rep_is_asked_only_about_known_fields_and_once() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    run(
        deps,
        ("ask_representative", {"field": "salary"}),  # not a rep question - sent back
        ("ask_representative", {"field": "participation:CAR-10"}),
        ("ask_representative", {"field": "participation:CAR-10"}),
        FINAL,
    )
    assert [r.field for r in deps.turn.rep_requests] == ["participation:CAR-10"]


def test_comparing_a_car_with_a_default_participation_asks_the_rep_by_itself() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(deps, ("compare", {"option_ids": ["CAR-10", "waiver"]}), FINAL)
    by_id = {item["id"]: item for item in tool_returns(result)[0].content["results"]}
    atto, waiver = by_id["CAR-10"], by_id["waiver"]
    assert "rep was asked" in atto["participation"] and "participation" not in waiver
    assert [r.field for r in deps.turn.rep_requests] == ["participation:CAR-10"]  # only the car compared


def test_personal_amounts_are_redacted_in_the_trace() -> None:
    deps = deps_for()
    run(deps, ("update_profile", {"occupation": "מנהל/ת מוצר", "base_salary": 18500}), FINAL)
    call = deps.turn.trace[0]
    assert call.data == {"occupation": "מנהל/ת מוצר", "base_salary": "(נשמר)"}
    assert deps.profile.salary is not None and deps.profile.salary.base == 18500  # saved, just not shown


# ── Number Guard (secondary - the model never gets the money numbers in the first place) ──


def test_a_made_up_number_gets_one_retry() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(
        deps,
        ("compare", {"option_ids": ["CAR-10"]}),
        say("הנטו שלך עולה ב-661 ש״ח"),
        FINAL,
    )
    assert result.output.text == FINAL[1]["text"]
    guards = [e.data for e in deps.turn.trace if e.kind == "guard"]
    assert guards == [{"passed": False, "action": "retry", "numbers": ["661"]}, {"passed": True}]


def test_a_second_made_up_number_is_replaced_by_a_fixed_text() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(
        deps,
        ("compare", {"option_ids": ["CAR-10"]}),
        say("הנטו שלך עולה ב-661 ש״ח"),
        say("בערך 11,700 בחודש"),
    )
    assert result.output.text == FALLBACK_WITH_CARDS
    assert deps.turn.trace[-1].data["action"] == "template"


def test_numbers_the_employee_gave_or_a_tool_returned_are_fine() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(
        deps,
        ("check_eligibility", {"option_id": "CAR-14"}),
        say("שמרתי שכר בסיס של 18,500. רכב משנת 2025 מקבוצה ד לא מתאים לך."),
        prompt="השכר שלי 18500",
    )
    assert "18,500" in result.output.text
    assert [e.data for e in deps.turn.trace if e.kind == "guard"] == [{"passed": True}]


def test_a_number_only_the_employee_suggested_is_not_confirmed() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(
        deps,
        say("כן, הנטו שלך עולה ב-5,000"),
        say("את ההשפעה על הנטו אפשר לראות בכרטיס ההשוואה."),
        prompt="אז הנטו שלי עולה ב-5,000, נכון?",
    )
    assert "5,000" not in result.output.text
    assert deps.turn.trace[0].data == {"passed": False, "action": "retry", "numbers": ["5,000"]}


def test_the_rep_is_not_asked_about_a_car_the_employee_may_not_take() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    run(deps, ("ask_representative", {"field": "participation:CAR-14"}), FINAL)  # Tesla: higher group
    assert deps.turn.rep_requests == []


def test_catalog_cars_are_found_even_when_the_name_matches_hundreds_of_variants() -> None:
    deps = deps_for()
    result = run(deps, ("find_vehicle", {"query": "טויוטה", "reg_year": 2025}), FINAL)
    returned = tool_returns(result)[0].content
    names = {c["name"] for c in returned["candidates"]}
    assert "COROLLA CROSS" in names and "catalog" in returned["hint"]


# ── Found by testers on the live site ────────────────────────────────────────


def test_quick_replies_are_the_employees_words_never_the_bots_questions() -> None:
    """A tester saw "מה התפקיד שלך בחברה?" as a button to tap."""
    replies = [
        "מה התפקיד שלך בחברה?",
        "יש לי רכב חברה",
        "מה עם ויתור?",
        "איזה רכב יש לך היום?",
        "השוואת מחירים?",
    ]
    assert employee_replies(replies) == ["יש לי רכב חברה", "מה עם ויתור?", "השוואת מחירים?"]


def test_options_on_an_incomplete_profile_say_nothing_was_shown() -> None:
    """A tester got "here are the cars" while the screen asked for a missing detail."""
    result = run(deps_for(Profile(occupation="מנהל/ת מוצר")), ("list_options", {}), FINAL)
    returned = tool_returns(result)[0].content
    assert returned["shown_to_employee"] is False and "do NOT say" in returned["tell_employee"]
