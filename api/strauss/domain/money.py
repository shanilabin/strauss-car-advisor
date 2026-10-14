"""Money and quantity types.

All arithmetic is done in Decimal. Values cross the API boundary as JSON numbers:
- Money is rounded to agorot (2 decimals) when serialized; the UI rounds to whole shekels for display.
- Quantity (rates, percents, credit points) is serialized as-is.
"""

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated

from pydantic import PlainSerializer, WithJsonSchema

CENT = Decimal("0.01")
SHEKEL = Decimal("1")


def round_money(value: Decimal, step: Decimal = CENT) -> Decimal:
    """Round half-up (the way payroll is rounded), to agorot by default."""
    return value.quantize(step, rounding=ROUND_HALF_UP)


def _money_to_json(value: Decimal) -> float:
    return float(round_money(value))


def _quantity_to_json(value: Decimal) -> float:
    return float(value)


Money = Annotated[
    Decimal,
    PlainSerializer(_money_to_json, return_type=float, when_used="json"),
    WithJsonSchema({"type": "number"}),
]

Quantity = Annotated[
    Decimal,
    PlainSerializer(_quantity_to_json, return_type=float, when_used="json"),
    WithJsonSchema({"type": "number"}),
]
