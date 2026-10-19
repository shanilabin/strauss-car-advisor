# Strauss car advisor - working rules for Claude Code

Read before any task: [ARCHITECTURE.md](ARCHITECTURE.md) (the contract) and [TASKS.md](TASKS.md) (who does what).

## Ownership - never edit the other developer's folder
- Developer A (backend): `api/` (incl. `api/config/`), `supabase/`, `research/`, `data/`, `.github/`
- Developer B (frontend): `web/`
- `web/lib/api/schema.d.ts` is generated (`pnpm gen:api`) - never edit by hand.
- If a task needs a change outside your folder, stop and say so instead of making it.
- UI work follows `docs/ui/STRAUSS_UI_FINAL_SPEC.md`; `docs/ui/README.md` maps every UI element to the API field it comes from.
- Visual design (logo, mascot, "Color in Motion" palette, approved mockups): `docs/ui/brand-kit/`; web-ready assets in `web/public/brand/`, tokens in `web/app/globals.css`.

## Non-negotiables
- The LLM never computes numbers, and every number on screen is rendered from an engine DTO (never from bot text). All money math lives in `api/strauss/domain/` (pure, `Decimal`, no I/O).
- No business number in code (budgets, rates, amounts) - it belongs in `api/config/*.json`.
- Value of use is looked up by the full 5-field key, never by name alone.
- Missing information is asked (employee or rep), never guessed.
- `api/config/reference-results.json` must keep matching: 36/36.
- User-facing text is Hebrew. Code, identifiers and commit messages are English.
- Never commit secrets. Only `.env.example` files are tracked.

## Workflow
- One task = one branch: `a/<task-id>-<slug>` or `b/<task-id>-<slug>` -> PR -> CI green -> squash merge.
- Conventional Commits: `feat(engine): ...`, `fix(web): ...`.
- Backend checks: `cd api && uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest -q`
- Frontend checks: `cd web && pnpm lint && pnpm typecheck && pnpm build`
- Next.js here is v16: read `web/node_modules/next/dist/docs/` before using an unfamiliar API (see `web/AGENTS.md`).
