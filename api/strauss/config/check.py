"""CLI: validate a config bundle, optionally against the Tax Authority file. Runs in CI.

    uv run python -m strauss.config.check                                   # api/config, no CSV
    uv run python -m strauss.config.check --csv ../data/source/value-of-use-2026.csv
    uv run python -m strauss.config.check --dir path/to/candidate --csv ...

Exit code 1 if there is any error.
"""

import argparse
import sys
from pathlib import Path

from pydantic import ValidationError

from strauss.adapters.csv_value_of_use import CsvValueOfUseRepo
from strauss.config.crosscheck import crosscheck
from strauss.config.loader import CONFIG_DIR, bundle_from_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate the Strauss config bundle")
    parser.add_argument("--dir", type=Path, default=CONFIG_DIR, help="Config directory")
    parser.add_argument("--csv", type=Path, default=None, help="Tax Authority value-of-use CSV")
    args = parser.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Hebrew output on Windows consoles too

    try:
        bundle = bundle_from_dir(args.dir)
    except ValidationError as exc:
        print(f"✗ schema: {exc.error_count()} errors\n{exc}")
        return 1

    repo = CsvValueOfUseRepo(args.csv, bundle.rules.value_of_use) if args.csv else None
    report = crosscheck(bundle, repo)

    for issue in report.issues:
        mark = "✗" if issue.level == "error" else "!"
        print(f"{mark} [{issue.code}] {issue.path}: {issue.message_he}")
    stats = ", ".join(f"{k}={v}" for k, v in report.stats.items())
    vou = f", tax_authority_rows={len(repo)}" if repo else ""
    print(f"{'✓ ok' if report.ok else '✗ failed'} - {stats}{vou} - hash {bundle.config_hash[:12]}")
    return 0 if report.ok else 1


if __name__ == "__main__":
    sys.exit(main())
