"""Every field of the config bundle has a documented source in config/PROVENANCE.md (task A5.3).

A rule added to rules.json, the catalog or the occupations without a row in that file fails CI.
A row may cover a whole branch with ".*" (e.g. `netMethod.health.*`).
"""

import json
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

CONFIG = Path(__file__).resolve().parents[2] / "config"
DOCUMENTED = set(re.findall(r"`([A-Za-z][\w.\[\]*]*)`", (CONFIG / "PROVENANCE.md").read_text("utf-8")))


def leaves(value: Any, path: str) -> Iterator[str]:
    """Dotted paths to every leaf; a list of objects becomes 'name[]', a list of values is one leaf."""
    if isinstance(value, dict):
        for key, child in value.items():
            yield from leaves(child, f"{path}.{key}" if path else key)
    elif isinstance(value, list) and value and all(isinstance(v, dict) for v in value):
        for item in value:
            yield from leaves(item, f"{path}[]")
    else:
        yield path


def covered(path: str) -> bool:
    parts = path.split(".")
    return path in DOCUMENTED or any(".".join(parts[:i]) + ".*" in DOCUMENTED for i in range(1, len(parts)))


def undocumented(file: str, root: str = "") -> list[str]:
    data = json.loads((CONFIG / file).read_text("utf-8"))
    return sorted({p for p in leaves(data, root) if not covered(p)})


def test_every_rule_has_a_source() -> None:
    assert undocumented("rules.json") == []


def test_every_catalog_and_occupation_field_has_a_source() -> None:
    assert undocumented("catalog.json", "catalog") == []
    assert undocumented("occupations.json", "occupations") == []


def test_the_check_itself_notices_a_new_rule() -> None:
    assert not covered("electric.newRule") and covered("netMethod.health.lowRate")
