"""What is still missing before a comparison can be computed - decided in code, never by the model.

Profile-level gaps are asked from the employee. Option-level gaps (children for a special track, a
participation only the company knows) are reported on the option itself by compare().
"""

from strauss.domain.models import CarArrangement, MissingField, Profile

QUESTIONS: dict[str, str] = {
    "occupation": "מה התפקיד שלך בחברה?",
    "salary.base": "מה שכר הבסיס החודשי שלך (ברוטו)?",
    "deductions": "כמה אחוז מהשכר יורד לך לפנסיה, כמה לקרן השתלמות, וכמה נקודות זיכוי יש לך?",
    "current": "איזה רכב חברה יש לך היום (יצרן, דגם ושנת רישום)? או שאין לך רכב ואת/ה מקבל/ת אחזקה?",
    "current.participation": "כמה את/ה משלם/ת היום בחודש על הרכב (השתתפות)?",
    "children_under_23": "כמה ילדים עד גיל {max_age} יש לך?",
    "participation": "מה סכום ההשתתפות של העובד ב-{car}, וממתי הוא בתוקף?",
    "occupation.confirm": (
        'העובד/ת מסר/ה עיסוק "{occupation}" שלא מופיע בטבלת העיסוקים. '
        "לאיזה עיסוק בטבלה הוא מתאים? (העיסוק קובע את הקבוצה)"
    ),
}


def employee_question(field: str, **params: str | int) -> MissingField:
    return MissingField(field=field, ask="employee", question=QUESTIONS[field].format(**params))


def rep_question(field: str, question_key: str, **params: str | int) -> MissingField:
    return MissingField(field=field, ask="rep", question=QUESTIONS[question_key].format(**params))


def missing_fields(profile: Profile) -> list[MissingField]:
    """Everything needed to compute 'today' and any option, in the order the bot should ask."""
    missing: list[MissingField] = []
    if not profile.occupation:
        missing.append(employee_question("occupation"))
    if profile.salary is None:
        missing.append(employee_question("salary.base"))
    if profile.deductions is None:
        missing.append(employee_question("deductions"))
    if profile.current is None:
        missing.append(employee_question("current"))
    elif isinstance(profile.current, CarArrangement) and profile.current.participation is None:
        missing.append(employee_question("current.participation"))
    return missing
