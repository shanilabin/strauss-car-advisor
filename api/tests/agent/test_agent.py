"""The agent with a scripted model (PydanticAI FunctionModel): real tools, real engine, real data - no
network, no keys, no cost. The script plays the LLM's part: which tools to call and with what."""

import json
import re
from typing import Any

import pytest
from pydantic_ai import Agent
from pydantic_ai.exceptions import FallbackExceptionGroup, ModelHTTPError
from pydantic_ai.messages import (
    ModelRequest,
    ModelResponse,
    TextPart,
    ToolReturnPart,
)
from pydantic_ai.models.fallback import FallbackModel
from pydantic_ai.models.function import FunctionModel
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIChatModel

from strauss.agent.agent import ReplyDraft, build_agent, employee_replies, state_block, to_reply
from strauss.agent.deps import AgentDeps
from strauss.agent.guard import FALLBACK_WITH_CARDS
from strauss.agent.models_chain import AgentUnavailable, Cooldowns, CoolingModel, build_model
from strauss.agent.schemas import ComparisonCard, MissingCard, OptionsCard
from strauss.config.loader import load_bundle, load_sample_employees
from strauss.config.samples import to_profile
from strauss.domain.models import CarArrangement, Profile, WaiverArrangement
from strauss.services.turn import latest_cards
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
    members = [m.wrapped for m in chain.models]  # each wrapped in a CoolingModel
    names = [m.model_name for m in members]
    assert sum(name.startswith("gemini") for name in names) >= 3
    # Groq limits tokens per minute per model, so several Groq models follow the Gemini ones
    groq = [m for m in members if isinstance(m, OpenAIChatModel)]
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
    assert returned["saved"] == ["occupation", "salary"] and "not_saved" not in returned
    assert deps.profile.salary is not None and deps.profile.salary.base == 15000
    # resembling no listed occupation, it is kept as said and the rep is asked which one it is
    assert deps.profile.occupation == "מנתח/ת מערכות"
    assert [r.field for r in deps.turn.rep_requests] == ["occupation"]


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


def test_a_default_participation_is_flagged_as_an_estimate_and_offered_to_the_rep() -> None:
    deps = deps_for(to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE))
    result = run(deps, ("compare", {"option_ids": ["CAR-10", "waiver"]}), FINAL)
    by_id = {item["id"]: item for item in tool_returns(result)[0].content["results"]}
    atto, waiver = by_id["CAR-10"], by_id["waiver"]
    assert "an estimate" in atto["participation"] and atto["ask_rep_field"] == "participation:CAR-10"
    assert "participation" not in waiver and deps.turn.rep_requests == []


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


# ── After the comparison: recommendation, "why?", and a change recomputes ────


def noa() -> Profile:
    return to_profile(next(e for e in load_sample_employees() if e.id == "E-001"), BUNDLE)


def test_a_comparison_comes_with_a_recommendation_and_the_reasons_in_words() -> None:
    deps = deps_for(noa())
    result = run(deps, ("compare", {"option_ids": ["CAR-10"]}), FINAL)
    (returned,) = [p.content for p in tool_returns(result) if p.tool_name == "compare"]
    # the ATTO 3 raises Noa's net, but giving up the car raises it more - and that is what she is told
    assert "(id waiver), leaves more" in returned["recommendation"]
    (atto,) = returned["results"]
    assert atto["because"] and all(("raises" in b or "lowers" in b) for b in atto["because"])
    assert not MONEY.search(json.dumps(returned, ensure_ascii=False))
    assert deps.shown is not None and deps.shown.results[0].option.id == "CAR-10"


def test_a_detail_changed_in_the_chat_recomputes_the_comparison_on_screen() -> None:
    first = deps_for(noa())
    run(first, ("compare", {"option_ids": ["CAR-10"]}), FINAL)
    deps = deps_for(noa())
    deps.shown = first.shown  # the next turn starts from what is on screen
    result = run(deps, ("update_profile", {"base_salary": 25000}), FINAL, prompt="השכר שלי עלה ל-25000")
    (returned,) = [p.content for p in tool_returns(result) if p.tool_name == "update_profile"]
    assert returned["recalculated"]["shown_to_employee"] is True
    (card,) = to_reply(result.output, deps).cards
    assert isinstance(card, ComparisonCard)
    (atto,) = card.comparison.results
    assert atto.option.id == "CAR-10" and atto.net_today != 11032  # the same car, the new salary
    assert deps.shown is card.comparison


def test_nothing_is_recomputed_before_anything_was_shown() -> None:
    deps = deps_for(noa())
    result = run(deps, ("update_profile", {"base_salary": 25000}), FINAL)
    (returned,) = [p.content for p in tool_returns(result) if p.tool_name == "update_profile"]
    assert "recalculated" not in returned and to_reply(result.output, deps).cards == []


def test_the_state_block_says_what_is_on_screen() -> None:
    deps = deps_for(noa())
    assert '"on_screen": null' in state_block(deps)
    run(deps, ("compare", {"option_ids": ["CAR-10", "waiver"]}), FINAL)
    block = state_block(deps)
    assert '"on_screen"' in block and '"id": "CAR-10"' in block and "best_for_net" in block


# ── QA report: no loops, no copies, the right recommendation ─────────────────


def returned_by(result: Any, tool: str) -> list[Any]:
    return [p.content for p in tool_returns(result) if p.tool_name == tool]


def test_the_best_of_all_alternatives_is_recommended_when_it_is_on_screen() -> None:
    deps = deps_for(noa())
    result = run(deps, ("compare", {"option_ids": ["CAR-10", "waiver"]}), FINAL)
    (returned,) = returned_by(result, "compare")
    assert "leaves the most" in returned["recommendation"] and "ויתור" in returned["recommendation"]


def test_saving_the_same_value_again_recomputes_nothing() -> None:
    """QA B01: the model "saved" the same salary over and over, and every save added a comparison."""
    deps = deps_for(noa())
    run(deps, ("compare", {"option_ids": ["CAR-10"]}), FINAL)
    shown = deps.shown
    result = run(deps, ("update_profile", {"base_salary": 18500}), FINAL)  # Noa's salary already
    (returned,) = returned_by(result, "update_profile")
    assert returned["saved"] == [] and returned["already_saved"] == ["salary"]
    assert "recalculated" not in returned and deps.shown is shown


def test_what_if_i_give_up_the_car_never_overwrites_todays_car() -> None:
    """QA B01: "what if I give up the car?" was saved as "I have no car today"."""
    deps = deps_for(noa())
    result = run(deps, ("update_profile", {"current_is_waiver": True}), FINAL)
    (returned,) = returned_by(result, "update_profile")
    assert "compare" in returned["not_saved"]["current"]
    assert isinstance(deps.profile.current, CarArrangement)  # the Corolla Cross is still today's car
    corrected = run(deps, ("update_profile", {"current_is_waiver": True, "replaces_todays_car": True}), FINAL)
    assert returned_by(corrected, "update_profile")[0]["saved"] == ["current"]
    assert isinstance(deps.profile.current, WaiverArrangement)


def test_a_reply_carries_one_comparison_however_often_the_model_compared() -> None:
    deps = deps_for(noa())
    run(
        deps,
        ("compare", {"option_ids": ["waiver"]}),
        ("compare", {"option_ids": ["waiver"]}),
        ("compare", {"option_ids": ["CAR-10", "waiver"]}),
        FINAL,
    )
    assert len(deps.turn.cards) == 3
    (card,) = latest_cards(deps.turn.cards)
    assert isinstance(card, ComparisonCard) and len(card.comparison.results) == 2  # the last one


def test_the_payslips_value_of_use_pins_the_exact_car() -> None:
    """After a payslip upload: "Corolla Cross 2025, value of use 4070". Three variants share that value;
    the company car is the catalog's one."""
    no_car = noa().model_copy(update={"current": None})
    deps = deps_for(no_car)
    result = run(
        deps,
        ("find_vehicle", {"query": "corolla cross", "reg_year": 2025, "payslip_value_of_use": 4070}),
        FINAL,
        prompt="העליתי את תלוש השכר שלי. הרכב שלי לפי התלוש: טויוטה קורולה קרוס 2025. שווי שימוש: 4070 ₪.",
    )
    (found,) = returned_by(result, "find_vehicle")
    (candidate,) = found["candidates"]
    assert candidate["key"] == {"tax_year": 2026, **COROLLA_CROSS_2025}


def test_a_recommendation_built_on_a_default_participation_says_it_is_an_estimate() -> None:
    """Reviewers' point: "the best" may rest on a participation the rep has not confirmed yet.
    David's best is the MG4, whose participation is still the catalog default."""
    david = to_profile(next(e for e in load_sample_employees() if e.id == "E-002"), BUNDLE)
    result = run(deps_for(david), ("compare", {"option_ids": ["CAR-06"]}), FINAL)
    (returned,) = returned_by(result, "compare")
    assert "leaves the most" in returned["recommendation"]
    assert "an estimate until the transport rep confirms" in returned["recommendation"]


# ── A chain remembers which models are exhausted ─────────────────────────────


def _counting(name: str, calls: list[str], fail: int | None = None) -> FunctionModel:
    def respond(_messages: Any, _info: Any) -> ModelResponse:
        calls.append(name)
        if fail is not None:
            raise ModelHTTPError(fail, name)
        return ModelResponse(parts=[TextPart("שלום")])

    return FunctionModel(respond, model_name=name)


def test_a_model_out_of_quota_is_skipped_on_the_next_requests() -> None:
    """Every turn makes several requests: an exhausted model must not be knocked on before each one."""
    calls: list[str] = []
    board = Cooldowns()
    chain = FallbackModel(
        CoolingModel(_counting("exhausted", calls, fail=429), "a", board),
        CoolingModel(_counting("fresh", calls), "b", board),
    )
    agent: Agent[None, str] = Agent(chain)
    for _ in range(3):
        assert agent.run_sync("שלום").output == "שלום"
    assert calls == ["exhausted", "fresh", "fresh", "fresh"]


def test_when_every_model_is_resting_they_are_tried_anyway() -> None:
    calls: list[str] = []
    board = Cooldowns()
    chain = FallbackModel(
        CoolingModel(_counting("one", calls, fail=429), "a", board),
        CoolingModel(_counting("two", calls, fail=503), "b", board),
    )
    agent: Agent[None, str] = Agent(chain)
    for _ in range(2):
        with pytest.raises(FallbackExceptionGroup):
            agent.run_sync("שלום")
    assert calls == ["one", "two", "one", "two"]  # nothing left to skip to - better to try than to give up


def test_a_name_told_in_the_chat_is_saved_and_recomputes_nothing() -> None:
    deps = deps_for(noa())
    run(deps, ("compare", {"option_ids": ["CAR-10"]}), FINAL)
    shown = deps.shown
    result = run(deps, ("update_profile", {"first_name": "נועה"}), FINAL, prompt="קוראים לי נועה")
    (returned,) = returned_by(result, "update_profile")
    assert returned["saved"] == ["first_name"] and "recalculated" not in returned
    assert deps.profile.first_name == "נועה" and deps.shown is shown


def test_the_state_says_whether_the_employee_may_give_up_the_car() -> None:
    """A car-required role (field sales, drivers) is never offered a waiver, not even as a quick reply."""
    driver = noa().model_copy(update={"occupation": "נהג/ת הפצה"})
    assert '"may_give_up_car": false' in state_block(deps_for(driver))
    assert '"may_give_up_car": true' in state_block(deps_for(noa()))
    assert '"may_give_up_car": null' in state_block(deps_for())


def test_comparing_never_asks_the_rep_by_itself() -> None:
    """Testers: "I only wanted to check - why wait for a rep?" A default participation is an estimate; the
    rep is asked only when the employee wants the car (the card's button, or ask_representative)."""
    deps = deps_for(noa())
    result = run(deps, ("compare", {"option_ids": ["CAR-03", "CAR-06", "CAR-10"]}), FINAL)
    (returned,) = returned_by(result, "compare")
    assert deps.turn.rep_requests == []
    assert all(
        "an estimate until the transport rep confirms" in i["participation"] for i in returned["results"]
    )
    one = deps_for(noa())
    run(one, ("compare", {"option_ids": ["CAR-10"]}), FINAL)
    assert one.turn.rep_requests == []


def test_quick_replies_never_guess_who_the_employee_is() -> None:
    """Tester: asked "what is your role?", the bot offered three random occupations to tap."""
    deps = deps_for()
    draft = ReplyDraft(
        text="מה התפקיד שלך?", quick_replies=["נציג/ת מכירות שטח", "מפתח/ת תוכנה", "לא בטוח/ה"]
    )
    assert to_reply(draft, deps).quick_replies == ["לא בטוח/ה"]


def test_a_car_required_role_is_never_offered_a_waiver_quick_reply() -> None:
    driver = deps_for(noa().model_copy(update={"occupation": "נהג/ת הפצה"}))
    draft = ReplyDraft(text="הנה ההשוואה.", quick_replies=["מה עם ויתור?", "למה יש הפרש?"])
    assert to_reply(draft, driver).quick_replies == ["למה יש הפרש?"]
    assert to_reply(draft, deps_for(noa())).quick_replies == ["מה עם ויתור?", "למה יש הפרש?"]


def test_the_employee_who_wants_the_car_gets_the_rep_asked_once() -> None:
    """ "I want the ATTO 3" -> ask_representative; comparing car after car asks nobody."""
    deps = deps_for(noa())
    steps = [("compare", {"option_ids": [car]}) for car in ("CAR-10", "CAR-06", "CAR-03")]
    run(deps, *steps, ("ask_representative", {"field": "participation:CAR-10"}), FINAL)
    assert [r.field for r in deps.turn.rep_requests] == ["participation:CAR-10"]


def test_a_cleaner_goes_to_the_rep_without_the_model_looping() -> None:
    """Tester: "I'm a cleaner" - the bot said it asked the rep, nothing reached the rep, and the next turn
    looped save/ask-rep until it got stuck. One update_profile now saves it and asks the rep."""
    deps = deps_for()
    result = run(deps, ("update_profile", {"occupation": "מנקה"}), say("העברתי לנציג התחבורה."))
    (returned,) = returned_by(result, "update_profile")
    assert returned["saved"] == ["occupation"] and "the transport rep was asked" in returned["occupation"]
    (request,) = deps.turn.rep_requests
    assert request.field == "occupation" and "מנקה" in request.question
    again = run(deps, ("ask_representative", {"field": "occupation"}), say("כבר נשאל."))
    assert returned_by(again, "ask_representative") == [{"sent": False, "already_asked": True}]


def test_a_near_spelling_of_a_listed_occupation_is_checked_with_the_employee() -> None:
    deps = deps_for()
    result = run(deps, ("update_profile", {"occupation": "מפתחת תוכנה"}), say("התכוונת למפתח/ת תוכנה?"))
    (returned,) = returned_by(result, "update_profile")
    assert "מפתח/ת תוכנה" in returned["not_saved"]["occupation"] and deps.turn.rep_requests == []
