"""Number Guard - the secondary defence. The primary one is structural: the model never receives the
calculation's money results, and every number on screen comes from a card.

The guard checks the model's words anyway: a number of 10 or more in the reply must come from the
conversation state (what the employee told us and we saved) or from a tool result (a budget quoted in an
eligibility reason, a registration year). Numbers that only appear in the employee's message don't count -
otherwise "so my net goes up by 5,000, right?" could be confirmed. Anything else is a number the model
made up: it gets one retry, and after that the reply is replaced with a fixed text.
"""

import re
from collections.abc import Iterable
from decimal import Decimal, InvalidOperation

from pydantic_ai.messages import ModelMessage, ModelRequest, ToolReturnPart

NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")
MIN_CHECKED = Decimal(10)  # small counts ("2 ילדים", "ATTO 3") are fine anywhere

# 9 digits standing alone - an Israeli ID number. Masked before the model or the database sees it.
ISRAELI_ID = re.compile(r"(?<!\d)(?<!\d[,.])\d{9}(?!\d)(?![,.]\d)")
ID_MASK = "[ת״ז הוסתרה]"

FALLBACK_WITH_CARDS = "הנה התוצאות. כל המספרים מופיעים בכרטיסים שעל המסך."
FALLBACK_WITHOUT_CARDS = "סליחה, לא הצלחתי לנסח תשובה מדויקת. אפשר לנסח את השאלה שוב?"


def mask_ids(text: str) -> str:
    return ISRAELI_ID.sub(ID_MASK, text)


def numbers(text: str) -> set[Decimal]:
    """Every number in the text, normalised: '18,500' and '18500' are the same number."""
    found: set[Decimal] = set()
    for match in NUMBER.findall(text):
        try:
            found.add(Decimal(match.replace(",", "")).normalize())
        except InvalidOperation:  # e.g. a lone "," run - not a number
            continue
    return found


def tool_results(messages: Iterable[ModelMessage]) -> str:
    """What the tools returned this turn - the only numbers, besides the state, the model may quote."""
    parts: list[str] = []
    for message in messages:
        if not isinstance(message, ModelRequest):
            continue
        for part in message.parts:
            if isinstance(part, ToolReturnPart):
                parts.append(str(part.content))
    return "\n".join(parts)


def invented(reply: str, allowed_source: str) -> list[str]:
    """Numbers of 10 or more in the reply that the model was never shown, as written in the reply."""
    allowed = numbers(allowed_source)
    return sorted(
        {
            match
            for match in NUMBER.findall(reply)
            if (value := Decimal(match.replace(",", "")).normalize()) >= MIN_CHECKED and value not in allowed
        }
    )
