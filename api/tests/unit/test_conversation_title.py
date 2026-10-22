"""A conversation is named by the employee's first message - no model is asked."""

import pytest

from strauss.services.conversations import TITLE_MAX, conversation_title


@pytest.mark.parametrize(
    ("first_message", "title"),
    [
        ("אני מנהלת מוצר ויש לי שני ילדים. אני שוקלת לעבור לרכב חשמלי", "אני מנהלת מוצר ויש לי שני ילדים"),
        ("העליתי את תלוש השכר שלי. שווי שימוש בתלוש: 4070 ₪.", "העליתי את תלוש השכר שלי"),
        ("היי. מה האפשרויות שלי?", "היי. מה האפשרויות שלי?"),  # "היי" alone says nothing
        ("  כמה   מקומות יש בקונה?  ", "כמה מקומות יש בקונה"),
        ("נקודות זיכוי 2.75 ופנסיה 6%", "נקודות זיכוי 2.75 ופנסיה 6%"),  # a decimal point is no sentence end
        ("", "שיחה"),
    ],
)
def test_the_title_is_the_first_sentence(first_message: str, title: str) -> None:
    assert conversation_title(first_message) == title


def test_a_long_first_sentence_is_cut_at_a_word() -> None:
    title = conversation_title("אני עובדת בשטראוס כבר הרבה שנים ורוצה לדעת מה קורה לנטו שלי אם אחליף את הרכב")
    assert len(title) <= TITLE_MAX + 1 and title.endswith("…")
    assert not title.removesuffix("…").endswith(" ")
