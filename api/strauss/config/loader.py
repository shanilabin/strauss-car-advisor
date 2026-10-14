"""Loads the config bundle from api/config/ (shipped with the deployment).

The bundle is read once per process. config_hash fingerprints the three rule files so every
comparison can record exactly which rules produced it.
"""

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from strauss.config.models import CatalogCar, Occupation, SampleEmployee

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
BUNDLE_FILES = ("rules.json", "catalog.json", "occupations.json")


def _read_json(name: str) -> Any:
    return json.loads((CONFIG_DIR / name).read_text(encoding="utf-8"))


@lru_cache
def load_rules_raw() -> dict[str, Any]:
    rules: dict[str, Any] = _read_json("rules.json")
    return rules


@lru_cache
def load_catalog() -> tuple[CatalogCar, ...]:
    return tuple(TypeAdapter(list[CatalogCar]).validate_python(_read_json("catalog.json")))


@lru_cache
def load_occupations() -> tuple[Occupation, ...]:
    return tuple(TypeAdapter(list[Occupation]).validate_python(_read_json("occupations.json")))


@lru_cache
def config_hash() -> str:
    """SHA-256 over the normalized JSON of the bundle, so whitespace or key order never change it."""
    digest = hashlib.sha256()
    for name in BUNDLE_FILES:
        normalized = json.dumps(_read_json(name), ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        digest.update(name.encode())
        digest.update(normalized.encode())
    return digest.hexdigest()


@lru_cache
def load_sample_employees() -> tuple[SampleEmployee, ...]:
    """The challenge's fictitious sample employees (demo and tests)."""
    return tuple(TypeAdapter(list[SampleEmployee]).validate_python(_read_json("sample-employees.json")))
