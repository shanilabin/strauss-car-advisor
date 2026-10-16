from decimal import Decimal

from strauss.agent.guard import ID_MASK, invented, mask_ids, numbers


def test_numbers_are_normalised() -> None:
    assert numbers("18,500 ו-18500 ו-2.50") == {Decimal(18500), Decimal("2.5")}


def test_only_numbers_of_ten_or_more_are_checked() -> None:
    assert invented("יש לך 2 ילדים ו-ATTO 3", "") == []
    assert invented("עולה ב-661", "") == ["661"]
    assert invented("עולה ב-1,938", "budget 1938") == []


def test_nine_digit_ids_are_masked_but_amounts_and_phones_are_not() -> None:
    assert mask_ids("תז 123456789 בבקשה") == f"תז {ID_MASK} בבקשה"
    assert mask_ids("טלפון 0501234567, שכר 18,500,000") == "טלפון 0501234567, שכר 18,500,000"


def test_an_id_at_the_end_of_a_sentence_is_masked() -> None:
    assert mask_ids("תעודת הזהות שלי 123456789.") == f"תעודת הזהות שלי {ID_MASK}."
    assert mask_ids("123456789, תודה") == f"{ID_MASK}, תודה"
