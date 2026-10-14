-- Strauss car advisor: initial schema (ARCHITECTURE.md, section 6)
--
-- Access model (least privilege):
--   * Every write goes through the API, which uses the secret key (bypasses RLS) and checks ownership.
--   * The browser only READS (and listens to Realtime) with the user's JWT, so RLS decides what it sees:
--       employee (anonymous sign-in)  -> only their own conversations and everything under them
--       rep (app_metadata.role='rep') -> only rep_questions (minimal context), never conversations
--   * value_of_use is public reference data (Tax Authority), readable by everyone.

create extension if not exists pg_trgm with schema extensions;

-- ── Helpers ─────────────────────────────────────────────────────────────────

create or replace function public.is_rep()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'rep', false)
$$;

comment on function public.is_rep() is
  'True when the caller''s JWT carries app_metadata.role = rep (set server-side, not editable by users).';

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Tax Authority value of use ──────────────────────────────────────────────

create table public.value_of_use (
  tax_year          smallint not null,
  reg_year          smallint not null,
  vehicle_type_code smallint not null,
  maker_code        text     not null check (maker_code ~ '^\d{5}$'),
  model_code        text     not null check (model_code ~ '^\d{5}$'),
  maker_name        text     not null,
  commercial_name   text     not null,
  model_desc        text     not null,
  drive_code        text     not null,  -- raw code from the file; mapped to a drive by rules.valueOfUse.driveField
  fuel_type         text,
  automatic         text,
  green_score       text,
  pollution_level   text,
  engine_cc         text,
  weight            text,
  effective_date    text,
  list_price        integer  not null check (list_price >= 0),
  adjusted_price    integer,
  value_of_use      integer  not null check (value_of_use >= 0),
  primary key (tax_year, reg_year, vehicle_type_code, maker_code, model_code)
);

comment on table public.value_of_use is
  'Tax Authority extended value-of-use file. Looked up only by the full 5-field key (the primary key).';

create index value_of_use_commercial_name_trgm
  on public.value_of_use using gin (commercial_name extensions.gin_trgm_ops);
create index value_of_use_maker_name_trgm
  on public.value_of_use using gin (maker_name extensions.gin_trgm_ops);

-- ── Conversations ───────────────────────────────────────────────────────────

create table public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  status           text not null default 'COLLECTING'
                     check (status in ('COLLECTING', 'READY', 'PRESENTED', 'WAITING_REP')),
  profile          jsonb not null default '{}'::jsonb,
  profile_revision integer not null default 0 check (profile_revision >= 0),
  config_hash      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index conversations_user_id_idx on public.conversations (user_id);

create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'system_event')),
  content         text not null,
  payload         jsonb not null default '{}'::jsonb,  -- cards (engine DTOs) and quick replies
  created_at      timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at);

-- ── Rep questions ───────────────────────────────────────────────────────────

create table public.rep_questions (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  field            text not null,
  question         text not null,
  context          jsonb not null default '{}'::jsonb,  -- the minimum a rep needs: no salary, no chat
  profile_revision integer not null check (profile_revision >= 0),
  status           text not null default 'OPEN' check (status in ('OPEN', 'ANSWERED')),
  answer           jsonb,
  answered_by      uuid references auth.users (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  constraint rep_questions_answer_matches_status check (
    (status = 'OPEN' and answer is null and resolved_at is null)
    or (status = 'ANSWERED' and answer is not null and resolved_at is not null)
  )
);

comment on table public.rep_questions is
  'Answered atomically by the API: UPDATE ... WHERE id = $1 AND status = ''OPEN'' RETURNING *.';

create index rep_questions_status_created_idx on public.rep_questions (status, created_at);
create index rep_questions_conversation_idx on public.rep_questions (conversation_id);
create unique index rep_questions_one_open_per_field
  on public.rep_questions (conversation_id, field) where status = 'OPEN';

-- ── Audit: comparisons and agent trace ──────────────────────────────────────

create table public.comparisons (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid not null references public.conversations (id) on delete cascade,
  input                 jsonb not null,
  result                jsonb not null,
  config_version        text not null,
  config_hash           text not null,
  engine_version        text not null,
  payroll_tax_year      smallint not null,
  value_of_use_tax_year smallint not null,
  created_at            timestamptz not null default now()
);

create index comparisons_conversation_created_idx on public.comparisons (conversation_id, created_at);

create table public.agent_events (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  turn_id         uuid not null,
  kind            text not null check (kind in ('tool_call', 'tool_result', 'guard', 'model')),
  name            text not null,
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index agent_events_conversation_turn_idx on public.agent_events (conversation_id, turn_id);

-- ── Row Level Security ──────────────────────────────────────────────────────

alter table public.value_of_use  enable row level security;
alter table public.conversations enable row level security;
alter table public.messages      enable row level security;
alter table public.rep_questions enable row level security;
alter table public.comparisons   enable row level security;
alter table public.agent_events  enable row level security;

-- Browser roles read only; all writes go through the API (secret key).
revoke insert, update, delete, truncate on
  public.value_of_use, public.conversations, public.messages,
  public.rep_questions, public.comparisons, public.agent_events
from anon, authenticated;

-- ...and every table created later starts read-only for browser roles too.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

create policy "value_of_use is public reference data"
  on public.value_of_use for select
  to anon, authenticated
  using (true);

create policy "employees read their own conversations"
  on public.conversations for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "employees read messages of their own conversations"
  on public.messages for select
  to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id and c.user_id = (select auth.uid())
  ));

create policy "employees read comparisons of their own conversations"
  on public.comparisons for select
  to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = comparisons.conversation_id and c.user_id = (select auth.uid())
  ));

create policy "employees read the trace of their own conversations"
  on public.agent_events for select
  to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = agent_events.conversation_id and c.user_id = (select auth.uid())
  ));

create policy "employees read their own rep questions, reps read all"
  on public.rep_questions for select
  to authenticated
  using (
    (select public.is_rep())
    or exists (
      select 1 from public.conversations c
      where c.id = rep_questions.conversation_id and c.user_id = (select auth.uid())
    )
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
-- postgres_changes respects RLS, so each subscriber only receives rows it may read.

alter publication supabase_realtime add table public.conversations, public.messages, public.rep_questions;
