"""Plain-Hebrew texts built from templates - the bot never writes these, so they never drift from the data.

Eligibility reasons match the wording of the challenge's reference sheet where it has one.
Comparison explanations (two lines per option) are added in task A3.2.
"""

from decimal import Decimal

REASONS: dict[str, str] = {
    "OK_OWN_OR_LOWER": "הרכב מהקבוצה שלך או נמוכה ממנה",
    "OK_OWN_GROUP": "הרכב מהקבוצה שלך",
    "OK_ANY_GROUP": "לפי הכללים אפשר לבחור רכב מכל קבוצה",
    "HIGHER_GROUP": "הרכב מקבוצה {car_group}, גבוהה מהקבוצה שלך ({employee_group})",
    "OTHER_GROUP": "אפשר לבחור רק רכב מהקבוצה שלך ({employee_group}); הרכב הזה מקבוצה {car_group}",
    "OVER_BUDGET": "עלות הרכב ({cost} ₪) גבוהה מתקציב הקבוצה שלך ({budget} ₪)",
    "TRACK_OK": "{track_label} ({children} ילדים); על הפער מעל התקציב - {employee_share}% עובד",
    "TRACK_MIN_CHILDREN": "{track_label} מיועד למי שיש לו לפחות {min_children} ילדים עד גיל {max_age}",
    "WAIVER_OK": "העיסוק מאפשר ויתור",
    "CAR_REQUIRED": "בתפקיד {occupation} הרכב הוא חובה, ולכן אי אפשר לוותר עליו",
    "WAIVER_NOT_ALLOWED": "העיסוק {occupation} לא מאפשר ויתור על הרכב",
    "OCCUPATION_GROUP_MISMATCH": (
        "לפי העיסוק ({occupation}) הקבוצה היא {occupation_group}, אבל נמסרה קבוצה {stated_group}. "
        "צריך אישור של נציג התחבורה"
    ),
    "UNKNOWN_OCCUPATION": 'העיסוק "{occupation}" לא מופיע בטבלת העיסוקים. צריך אישור של נציג התחבורה',
    "MISSING_INFO": "חסר מידע: {missing}",
}

FIELD_LABELS: dict[str, str] = {
    "occupation": "העיסוק",
    "children_under_23": "מספר הילדים",
}


def shekels(amount: Decimal) -> str:
    """4500 -> '4,500' (for use inside Hebrew sentences; the UI formats standalone numbers itself)."""
    return f"{int(amount.to_integral_value()):,}"


def reason(code: str, **params: str | int | float) -> str:
    return REASONS[code].format(**params)


# ── Comparison: two plain lines per option ───────────────────────────────────

MINUS = "−"  # a real minus sign, so "-1,938" never reads as a hyphen


def signed_shekels(amount: Decimal) -> str:
    whole = int(amount.to_integral_value())
    if whole > 0:
        return f"+{whole:,}"
    if whole < 0:
        return f"{MINUS}{abs(whole):,}"
    return "0"


def value_of_use_line(today: Decimal, option: Decimal) -> str:
    """Line 1: the tax driver - what happens to the value of use added to taxable income."""
    if today > 0 and option == 0:
        return f"בלי רכב לא נוסף לשכר שלך שווי שימוש של {shekels(today)} ₪, ולכן המס יורד."
    if today == 0 and option > 0:
        return f"לרכב נוסף לשכר החייב במס שווי שימוש של {shekels(option)} ₪, ולכן המס עולה."
    if option < today:
        return f"שווי השימוש יורד מ-{shekels(today)} ל-{shekels(option)} ₪ בחודש, ולכן המס שלך יורד."
    if option > today:
        return f"שווי השימוש עולה מ-{shekels(today)} ל-{shekels(option)} ₪ בחודש, ולכן המס שלך עולה."
    return f"שווי השימוש לא משתנה ({shekels(today)} ₪ בחודש)."


def other_factors_line(parts: list[str], delta: Decimal) -> str:
    """Line 2: everything else that moves net pay, then the total."""
    total = f"ביחד: {signed_shekels(delta)} ₪ בחודש."
    return f"בנוסף {', '.join(parts)}. {total}" if parts else total


def participation_change(today: Decimal, option: Decimal) -> str | None:
    if option == today:
        return None
    if option == 0:
        return f"לא משלמים השתתפות ({shekels(today)} ₪ היום)"
    direction = "עולה" if option > today else "יורדת"
    return f"ההשתתפות {direction} מ-{shekels(today)} ל-{shekels(option)} ₪"
