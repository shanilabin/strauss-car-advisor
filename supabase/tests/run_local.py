"""Run the migrations and the RLS test against a throwaway local Postgres - no Supabase account needed.

    uv run --no-project --python 3.12 --with pgserver python supabase/tests/run_local.py

A minimal stand-in for Supabase is created first (roles anon/authenticated, auth.users, auth.uid(),
auth.jwt(), the realtime publication, default grants), then every migration in order, then
supabase/tests/rls_test.sql. Exits 1 if any check fails. The local Postgres build has no pg_trgm, so
only the fuzzy-search (trigram) statements are skipped; everything about access control runs for real.
"""

import re
import sys
import tempfile
from pathlib import Path

import pgserver

ROOT = Path(__file__).resolve().parents[1]

SUPABASE_STANDIN = """
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema extensions;
create table auth.users (id uuid primary key, email text, raw_app_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
grant usage on schema auth, extensions, public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create publication supabase_realtime;
"""


TRIGRAM_STATEMENT = re.compile(r"create (extension|index)[^;]*(pg_trgm|gin_trgm_ops)[^;]*;", re.IGNORECASE)
# Exactly these statements may be skipped locally; anything else matching the pattern fails the run.
EXPECTED_TRIGRAM_SKIPS = {"20261014120000_init_schema.sql": 3}


def main() -> int:
    server = pgserver.get_server(tempfile.mkdtemp(), cleanup_mode="delete")
    server.psql("create database strauss;")
    db = server.get_uri("strauss")

    import psycopg

    with psycopg.connect(db, autocommit=True) as conn:
        conn.execute(SUPABASE_STANDIN)
        for migration in sorted((ROOT / "migrations").glob("*.sql")):
            sql, skipped = TRIGRAM_STATEMENT.subn("", migration.read_text(encoding="utf-8"))
            expected = EXPECTED_TRIGRAM_SKIPS.get(migration.name, 0)
            if skipped != expected:
                print(f"{migration.name}: skipped {skipped} trigram statements, expected {expected}")
                return 1
            conn.execute(sql)
            print(f"applied {migration.name} (skipped {skipped} trigram statements)")
        cursor = conn.cursor()
        cursor.execute((ROOT / "tests" / "rls_test.sql").read_text(encoding="utf-8"))
        rows: list[tuple[str, bool]] = []
        while True:  # the file has two statements; the second one returns the checks
            if cursor.description:
                rows = cursor.fetchall()
            if not cursor.nextset():
                break

    failed = [name for name, passed in rows if not passed]
    for name, passed in rows:
        print(f"{'PASS' if passed else 'FAIL'}  {name}")
    print(f"{len(rows) - len(failed)}/{len(rows)} RLS checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
