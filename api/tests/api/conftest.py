from collections.abc import Iterator

import pytest

from index import app
from strauss.http.deps import get_value_of_use_repo
from tests.conftest import _tax_authority_repo


@pytest.fixture(autouse=True)
def tax_authority_from_csv() -> Iterator[None]:
    """API tests run against the real Tax Authority data, read from the CSV instead of Supabase."""
    app.dependency_overrides[get_value_of_use_repo] = _tax_authority_repo
    yield
    app.dependency_overrides.pop(get_value_of_use_repo, None)
