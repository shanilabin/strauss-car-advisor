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
