"""The 8 edge scenarios (PLAN.md, "תרחישי קצה"), end to end through the API: real tools, engine and Tax
Authority data, with a scripted model playing the LLM. Each test asserts what reaches the screen (cards,
state) and what reaches the model (words, never invented numbers)."""

from typing import Any

from fastapi.testclient import TestClient
from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart

from index import app
from strauss.config.loader import load_bundle
from tests.api.conftest import AS_NOA, ModelSlot
from tests.scripted import Step, say, scripted

client = TestClient(app)
BUNDLE = load_bundle()
GROUP_RANK = {g.code: i for i, g in enumerate(BUNDLE.rules.groups)}


def start(sample: str | None) -> str:
    body = {"sample_employee_id": sample} if sample else {}
    response = client.post("/v1/conversations", json=body, headers=AS_NOA)
    assert response.status_code == 201, response.text
    conversation_id: str = response.json()["id"]
    return conversation_id


def turn(model: ModelSlot, conversation_id: str, text: str, *steps: Step) -> tuple[dict[str, Any], list[Any]]:
    """One employee message. Returns the API body and what each tool returned to the model, in order."""
    seen: list[list[ModelMessage]] = []
    model.factory = lambda: scripted(*steps, seen=seen)
    response = client.post(
        f"/v1/conversations/{conversation_id}/messages", json={"text": text}, headers=AS_NOA
    )
    assert response.status_code == 200, response.text
    returned = [
        part.content
        for message in (seen[-1] if seen else [])
        if isinstance(message, ModelRequest)
        for part in message.parts
        if isinstance(part, ToolReturnPart)
    ]
    body: dict[str, Any] = response.json()
    return body, returned


def results(body: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        r["option"]["id"]: r
        for card in body["reply"]["cards"]
        if "comparison" in card
        for r in card["comparison"]["results"]
    }


def catalog_key(car_id: str) -> dict[str, Any]:
    car = next(c for c in BUNDLE.catalog if c.id == car_id)
    return {
        "reg_year": car.reg_year,
        "vehicle_type_code": car.vehicle_type_code,
        "maker_code": car.maker_code,
        "model_code": car.model_code,
    }


# 1 ── A software developer (group ב) may give up the car: maintenance 1,500 from the occupation table


def test_1_a_developer_may_give_up_the_car_and_gets_the_tables_maintenance(model: ModelSlot) -> None:
    conversation_id = start(None)
    body, returned = turn(
        model,
        conversation_id,
        "אני מפתחת תוכנה, 15,000 בסיס, 6% פנסיה, 2.5% השתלמות, 2.25 נקודות, בלי ילדים. "
        "יש לי יאריס קרוס 2025, "
        "משלמת 200. מה אם אוותר על הרכב?",
        ("update_profile", {"occupation": "מפתח/ת תוכנה", "base_salary": 15000, "pension_pct": 6,
                            "study_fund_pct": 2.5, "credit_points": 2.25, "children_under_23": 0}),
        ("set_current_car", {**catalog_key("CAR-02"), "participation": 200}),
        ("check_eligibility", {"option_id": "waiver"}),
        ("compare", {"option_ids": ["waiver"]}),
        say("אפשר לוותר על הרכב בתפקיד שלך. ההשוואה על המסך."),
    )  # fmt: skip
    waiver = results(body)["waiver"]
    assert waiver["eligibility"]["eligible"] is True
    assert waiver["maintenance"] == 1500  # from the occupation table, never from the model
    assert returned[2]["eligible"] is True and "ויתור" in returned[2]["reason"]


# 2 ── A field sales rep (group ב) may not: the car is required for the job


def test_2_a_field_sales_rep_may_not_give_up_the_car(model: ModelSlot) -> None:
    conversation_id = start("E-002")
    body, returned = turn(
        model,
        conversation_id,
        "אני רוצה לוותר על הרכב ולקבל אחזקה",
        ("check_eligibility", {"option_id": "waiver"}),
        ("compare", {"option_ids": ["waiver"]}),
        say("בתפקיד שלך הרכב הוא חובה, ולכן אי אפשר לוותר עליו."),
    )
    waiver = results(body)["waiver"]
    assert waiver["eligibility"]["eligible"] is False and waiver["net_option"] is None  # no numbers
    assert "חובה" in returned[0]["reason"]


# 3 ── Group ג asks for a Tesla (group ד): not eligible, and the electric cars of ג and below are offered


def test_3_a_tesla_is_above_the_group_and_the_allowed_electric_cars_are_offered(model: ModelSlot) -> None:
    conversation_id = start("E-001")  # Noa, group ג
    body, returned = turn(
        model,
        conversation_id,
        "אני רוצה טסלה מודל 3",
        ("check_eligibility", {"option_id": "CAR-14"}),
        ("list_options", {}),
        say("טסלה היא מקבוצה גבוהה משלך. הנה הרכבים החשמליים שמותרים לך."),
    )
    reason = returned[0]["reason"]
    assert returned[0]["eligible"] is False and "ד" in reason and "ג" in reason
    by_id = {c.id: c for c in BUNDLE.catalog}
    offered = [
        o
        for o in returned[1]["options"]
        if o["eligible"] and o["id"] in by_id and by_id[o["id"]].drive == "ELECTRIC"
    ]
    assert len(offered) >= 3
    assert all(GROUP_RANK[by_id[o["id"]].group] <= GROUP_RANK["ג"] for o in offered)
    assert "CAR-14" not in {o["id"] for o in offered}
    assert body["reply"]["cards"][0]["kind"] == "options"


# 4 ── 3 children asks for the Carnival: the family track needs 4 children up to 23


def test_4_three_children_are_not_enough_for_the_family_track(model: ModelSlot) -> None:
    conversation_id = start("E-004")  # 3 children
    _, returned = turn(
        model,
        conversation_id,
        "אפשר קרניבל? יש לי 3 ילדים",
        ("check_eligibility", {"option_id": "CAR-19"}),
        say("המסלול המשפחתי מיועד למי שיש לו לפחות 4 ילדים."),
    )
    assert returned[0]["eligible"] is False and "4" in returned[0]["reason"] and "23" in returned[0]["reason"]

    family = start("E-006")  # 4 children - the same car is allowed
    _, allowed = turn(
        model, family, "אפשר קרניבל?", ("check_eligibility", {"option_id": "CAR-19"}), say("כן.")
    )
    assert allowed[0]["eligible"] is True


# 5 ── Today's car isn't in the catalog: found in the Tax Authority data; many variants -> the payslip


def test_5_a_car_outside_the_catalog_is_pinned_by_the_payslip_and_valued_from_the_data(
    model: ModelSlot,
) -> None:
    conversation_id = start("E-001")
    body, returned = turn(
        model,
        conversation_id,
        "בעצם יש לי יונדאי קונה חשמלית 2024, שווי השימוש בתלוש 2,630",
        ("find_vehicle", {"query": "kona", "reg_year": 2024}),
        ("find_vehicle", {"query": "kona", "reg_year": 2024, "payslip_value_of_use": 2630}),
        ("set_current_car", {"reg_year": 2024, "vehicle_type_code": 1, "maker_code": "00481",
                             "model_code": "00308", "participation": 300}),
        say("מצאתי את הרכב ושמרתי אותו."),
    )  # fmt: skip
    many, pinned = returned[0], returned[1]
    assert many["too_many"] is True and "payslip" in many["hint"]  # no codes are asked, ever
    (candidate,) = pinned["candidates"]
    assert candidate["name"] == "KONA" and candidate["drive"] == "חשמלי"
    current = body["state"]["profile"]["current"]
    assert current["catalog_id"] is None  # not a catalog car
    assert current["vehicle"]["value_of_use"] == 2630  # from the data by full key
    assert body["state"]["missing"] == []


# 6 ── A salary correction in the middle: everything is recomputed


def test_6_a_salary_correction_mid_conversation_recomputes(model: ModelSlot) -> None:
    conversation_id = start("E-001")
    first, _ = turn(model, conversation_id, "ATTO 3?", ("compare", {"option_ids": ["CAR-10"]}), say("הנה."))
    second, _ = turn(
        model,
        conversation_id,
        "טעיתי, הבסיס שלי 21,000",
        ("update_profile", {"base_salary": 21000}),
        ("compare", {"option_ids": ["CAR-10"]}),
        say("עדכנתי את השכר. הנה ההשוואה המעודכנת."),
    )
    before, after = results(first)["CAR-10"], results(second)["CAR-10"]
    assert before["net_today"] == 11032 and after["net_today"] > before["net_today"]
    assert second["state"]["profile"]["salary"]["base"] == 21000
    assert second["state"]["profile"]["revision"] == first["state"]["profile"]["revision"] + 1
    assert second["state"]["latest_comparison"]["profile_snapshot"]["salary"]["base"] == 21000


# 7 ── An unknown participation: "I'm missing X, I asked the rep"


def test_7_an_unconfirmed_participation_is_flagged_as_an_estimate(model: ModelSlot) -> None:
    conversation_id = start("E-001")
    body, returned = turn(
        model,
        conversation_id,
        "ATTO 3?",
        ("compare", {"option_ids": ["CAR-10"]}),
        say("ההשתתפות ב-ATTO 3 היא הערכה עד שנציג התחבורה יאשר. רוצה שאבקש ממנו אישור?"),
    )
    (atto,) = returned[0]["results"]
    assert "an estimate until the transport rep confirms" in atto["participation"]
    assert results(body)["CAR-10"]["participation_status"] == "DEFAULT_PENDING"
    assert [c["kind"] for c in body["reply"]["cards"]] == ["comparison"]  # nobody asked yet
    assert body["state"]["status"] == "PRESENTED"


def test_8_a_rough_estimate_is_refused_and_the_missing_details_are_asked(model: ModelSlot) -> None:
    conversation_id = start(None)
    body, returned = turn(
        model,
        conversation_id,
        "אין לי כוח לפרטים, תן הערכה גסה כמה ארוויח מחשמלי",
        ("list_options", {}),
        say("בערך 600 ש״ח בחודש"),  # the model tries to guess - the guard sends it back
        say("בלי הפרטים שלך אני לא יכול לחשב, וגם לא לנחש. מה התפקיד שלך בחברה?"),
    )
    assert returned[0]["incomplete"] is True
    assert body["reply"]["cards"][0]["kind"] == "missing"
    assert "600" not in body["reply"]["text"]
    guards = [e["data"] for e in body["trace"] if e["kind"] == "guard"]
    assert guards[0]["action"] == "retry" and guards[-1] == {"passed": True}
