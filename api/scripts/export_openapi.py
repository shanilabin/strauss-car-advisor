"""Writes the API contract to api/openapi.json (the frontend generates its types from it).

uv run python scripts/export_openapi.py          # write
uv run python scripts/export_openapi.py --check  # CI: fail if the committed file is stale
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from index import app

TARGET = Path(__file__).resolve().parents[1] / "openapi.json"


def render() -> str:
    return json.dumps(app.openapi(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def main() -> int:
    content = render()
    if "--check" in sys.argv:
        current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else ""
        if current != content:
            print("api/openapi.json is out of date. Run: uv run python scripts/export_openapi.py")
            return 1
        print("api/openapi.json is up to date")
        return 0
    TARGET.write_text(content, encoding="utf-8", newline="\n")
    print(f"wrote {TARGET.name} ({len(app.openapi()['paths'])} paths)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
