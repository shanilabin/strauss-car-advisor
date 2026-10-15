import json
import os
import shutil
from collections.abc import Callable
from functools import lru_cache
from pathlib import Path
from typing import Any

import pytest
from hypothesis import HealthCheck, settings

from strauss.adapters.csv_value_of_use import CsvValueOfUseRepo
from strauss.config.loader import CONFIG_DIR, load_rules

REPO_ROOT = Path(__file__).resolve().parents[2]

# Property tests: deterministic in CI (same examples every run), exploring locally. No deadline - a
# gross-up bisection is fast but not "200 ms on a cold CI runner" fast.
settings.register_profile("ci", derandomize=True, deadline=None, suppress_health_check=[HealthCheck.too_slow])
settings.register_profile("dev", deadline=None, suppress_health_check=[HealthCheck.too_slow])
settings.load_profile("ci" if os.environ.get("CI") else "dev")
TAX_AUTHORITY_CSV = REPO_ROOT / "data" / "source" / "value-of-use-2026.csv"


@lru_cache
def _tax_authority_repo() -> CsvValueOfUseRepo:
    return CsvValueOfUseRepo(TAX_AUTHORITY_CSV, load_rules().value_of_use)


@pytest.fixture
def tax_authority() -> CsvValueOfUseRepo:
    """The real 77,988-row Tax Authority file (parsed once per test session)."""
    return _tax_authority_repo()


ConfigEditor = Callable[[str, Callable[[Any], None]], Path]


@pytest.fixture
def config_copy(tmp_path: Path) -> ConfigEditor:
    """Copy api/config to a temp dir; edit(file, mutate) applies a change and returns the directory."""
    target = tmp_path / "config"
    shutil.copytree(CONFIG_DIR, target)

    def edit(name: str, mutate: Callable[[Any], None]) -> Path:
        path = target / name
        data = json.loads(path.read_text(encoding="utf-8"))
        mutate(data)
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        return target

    return edit
