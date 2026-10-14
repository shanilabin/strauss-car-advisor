"""Interfaces the core depends on. Implementations live in strauss.adapters."""

from typing import Protocol

from strauss.domain.models import Vehicle, VehicleKey


class ValueOfUseRepo(Protocol):
    """The Tax Authority value-of-use data, looked up by the official 5-field key only."""

    def get(self, key: VehicleKey) -> Vehicle | None: ...
