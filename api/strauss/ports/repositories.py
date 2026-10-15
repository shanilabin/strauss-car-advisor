"""Interfaces the core depends on. Implementations live in strauss.adapters."""

from typing import Protocol

from strauss.domain.models import Vehicle, VehicleKey


class ValueOfUseRepo(Protocol):
    """The Tax Authority value-of-use data, looked up by the official 5-field key only."""

    def get(self, key: VehicleKey) -> Vehicle | None:
        """Exactly one vehicle for the full key, or None. Never a partial-key guess."""
        ...

    def search(self, query: str, tax_year: int, reg_year: int | None, limit: int) -> list[Vehicle]:
        """Candidates whose commercial or maker name contains the query, each with its full key."""
        ...
