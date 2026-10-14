"""Loads the config bundle from api/config/ (shipped with the deployment).

The active bundle is read and validated once per process. config_hash fingerprints the three rule files
so every comparison can record exactly which rules produced it. bundle_from_dir() loads any directory,
so tests and the CLI can validate a candidate config before it is committed.
"""

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from strauss.config.bundle import ConfigBundle
from strauss.config.models import CatalogCar, Occupation, SampleEmployee
from strauss.config.schema import Rules

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
BUNDLE_FILES = ("rules.json", "catalog.json", "occupations.json")


def _read_json(directory: Path, name: str) -> Any:
    return json.loads((directory / name).read_text(encoding="utf-8"))


def _hash(files: dict[str, Any]) -> str:
    """SHA-256 over the normalized JSON of the bundle, so whitespace or key order never change it."""
    digest = hashlib.sha256()
    for name in BUNDLE_FILES:
        normalized = json.dumps(files[name], ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        digest.update(name.encode())
        digest.update(normalized.encode())
    return digest.hexdigest()


def hash_dir(directory: Path) -> str:
    return _hash({name: _read_json(directory, name) for name in BUNDLE_FILES})


def bundle_from_dir(directory: Path) -> ConfigBundle:
    """Load and schema-validate a bundle. Raises pydantic.ValidationError on any schema problem.

    Each file is read once; the same parsed data is validated and fingerprinted.
    """
    files = {name: _read_json(directory, name) for name in BUNDLE_FILES}
    return ConfigBundle(
        rules=Rules.model_validate(files["rules.json"]),
        catalog=tuple(TypeAdapter(list[CatalogCar]).validate_python(files["catalog.json"])),
        occupations=tuple(TypeAdapter(list[Occupation]).validate_python(files["occupations.json"])),
        config_hash=_hash(files),
    )


@lru_cache
def load_bundle() -> ConfigBundle:
    """The active bundle (api/config/)."""
    return bundle_from_dir(CONFIG_DIR)


@lru_cache
def load_rules_raw() -> dict[str, Any]:
    """The rules file exactly as written - returned by /v1/config for the "why?" popover."""
    rules: dict[str, Any] = _read_json(CONFIG_DIR, "rules.json")
    return rules


def load_rules() -> Rules:
    return load_bundle().rules


def load_catalog() -> tuple[CatalogCar, ...]:
    return load_bundle().catalog


def load_occupations() -> tuple[Occupation, ...]:
    return load_bundle().occupations


def config_hash() -> str:
    return load_bundle().config_hash


@lru_cache
def load_sample_employees() -> tuple[SampleEmployee, ...]:
    """The challenge's fictitious sample employees (demo and tests)."""
    raw = _read_json(CONFIG_DIR, "sample-employees.json")
    return tuple(TypeAdapter(list[SampleEmployee]).validate_python(raw))
