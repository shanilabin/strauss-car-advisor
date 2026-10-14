-- Row Level Security test. Run in the Supabase SQL editor (as postgres).
-- Creates two employees and a rep, checks what each one can read and write, then ROLLS BACK
-- everything - nothing is left in the database. Expected: every row has passed = true.

create or replace function pg_temp.strauss_rls_test()
returns table (check_name text, passed boolean)
language plpgsql
as $$
declare
  employee_a uuid := gen_random_uuid();
  employee_b uuid := gen_random_uuid();
  rep_user   uuid := gen_random_uuid();
  conv_a     uuid := gen_random_uuid();
  conv_b     uuid := gen_random_uuid();
  checks     jsonb := '[]'::jsonb;
  blocked    boolean;

begin
  begin
    -- Fixture (as postgres)
    insert into auth.users (id, email, raw_app_meta_data) values
      (employee_a, 'rls-a@test.local', '{}'),
      (employee_b, 'rls-b@test.local', '{}'),
      (rep_user,   'rls-rep@test.local', '{"role": "rep"}');
    insert into public.conversations (id, user_id, profile) values
      (conv_a, employee_a, '{"salary": {"base": 18500}}'),
      (conv_b, employee_b, '{"salary": {"base": 9800}}');
    insert into public.messages (conversation_id, role, content) values
      (conv_a, 'user', 'a'), (conv_b, 'user', 'b');
    insert into public.rep_questions (conversation_id, field, question, profile_revision) values
      (conv_a, 'participation:CAR-10', 'q-a', 0), (conv_b, 'participation:CAR-05', 'q-b', 0);
    insert into public.comparisons (conversation_id, input, result, config_version, config_hash,
                                    engine_version, payroll_tax_year, value_of_use_tax_year) values
      (conv_a, '{}', '{"net": 11032}', 'v', 'h', 'e', 2025, 2026),
      (conv_b, '{}', '{"net": 8600}', 'v', 'h', 'e', 2025, 2026);
    insert into public.agent_events (conversation_id, turn_id, kind, name) values
      (conv_a, gen_random_uuid(), 'tool_call', 'compare'),
      (conv_b, gen_random_uuid(), 'tool_call', 'compare');
    create table public.rls_test_future_table (id int);  -- created after the migration
    insert into public.value_of_use
      (tax_year, reg_year, vehicle_type_code, maker_code, model_code, maker_name, commercial_name,
       model_desc, drive_code, list_price, value_of_use)
    values (2026, 2025, 1, '99999', '99999', 'test', 'RLS TEST CAR', 'x', '3', 1, 1);

    -- Employee A
    perform set_config('request.jwt.claims',
      json_build_object('sub', employee_a, 'role', 'authenticated', 'app_metadata', '{}'::json)::text, true);
    execute 'set local role authenticated';
    checks := checks
      || jsonb_build_object('n', 'employee sees only their own conversation',
           'p', (select count(*) from public.conversations) = 1
                and (select id from public.conversations limit 1) = conv_a)
      || jsonb_build_object('n', 'employee sees only their own messages',
           'p', (select count(*) from public.messages) = 1)
      || jsonb_build_object('n', 'employee sees only their own rep questions',
           'p', (select count(*) from public.rep_questions) = 1)
      || jsonb_build_object('n', 'employee sees only their own comparisons',
           'p', (select count(*) from public.comparisons) = 1)
      || jsonb_build_object('n', 'employee sees only their own agent trace',
           'p', (select count(*) from public.agent_events) = 1)
      || jsonb_build_object('n', 'employee can read value_of_use',
           'p', (select count(*) from public.value_of_use where maker_code = '99999') = 1);
    begin
      insert into public.rls_test_future_table values (1);
      blocked := false;
    exception when insufficient_privilege then
      blocked := true;
    end;
    checks := checks || jsonb_build_object('n', 'tables added later are read-only for browsers too', 'p', blocked);
    begin
      insert into public.messages (conversation_id, role, content) values (conv_a, 'user', 'direct write');
      blocked := false;
    exception when insufficient_privilege then
      blocked := true;
    end;
    checks := checks || jsonb_build_object('n', 'employee cannot write directly (API only)', 'p', blocked);
    begin
      update public.conversations set status = 'READY' where id = conv_a;
      blocked := false;
    exception when insufficient_privilege then
      blocked := true;
    end;
    checks := checks || jsonb_build_object('n', 'employee cannot update directly (API only)', 'p', blocked);
    execute 'reset role';

    -- Rep
    perform set_config('request.jwt.claims',
      json_build_object('sub', rep_user, 'role', 'authenticated',
                        'app_metadata', json_build_object('role', 'rep'))::text, true);
    execute 'set local role authenticated';
    checks := checks
      || jsonb_build_object('n', 'rep sees every rep question',
           'p', (select count(*) from public.rep_questions) = 2)
      || jsonb_build_object('n', 'rep sees no conversations (no salary)',
           'p', (select count(*) from public.conversations) = 0)
      || jsonb_build_object('n', 'rep sees no messages',
           'p', (select count(*) from public.messages) = 0)
      || jsonb_build_object('n', 'rep sees no comparisons or trace',
           'p', (select count(*) from public.comparisons) + (select count(*) from public.agent_events) = 0);
    begin
      update public.rep_questions set status = 'ANSWERED' where conversation_id = conv_a;
      blocked := false;
    exception when insufficient_privilege then
      blocked := true;
    end;
    checks := checks || jsonb_build_object('n', 'rep answers only through the API', 'p', blocked);
    execute 'reset role';

    -- Anonymous visitor (no sign-in)
    perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
    execute 'set local role anon';
    checks := checks
      || jsonb_build_object('n', 'visitor without sign-in sees no conversations',
           'p', (select count(*) from public.conversations) = 0)
      || jsonb_build_object('n', 'visitor without sign-in can read value_of_use',
           'p', (select count(*) from public.value_of_use where maker_code = '99999') = 1);
    execute 'reset role';

    -- Data integrity
    begin
      insert into public.rep_questions (conversation_id, field, question, profile_revision)
      values (conv_a, 'participation:CAR-10', 'duplicate open question', 0);
      blocked := false;
    exception when unique_violation then
      blocked := true;
    end;
    checks := checks || jsonb_build_object('n', 'one open question per field', 'p', blocked);
    begin
      update public.rep_questions set status = 'ANSWERED' where conversation_id = conv_b;
      blocked := false;
    exception when check_violation then
      blocked := true;
    end;
    checks := checks || jsonb_build_object('n', 'answered requires an answer and a time', 'p', blocked);

    raise exception using errcode = 'P0001', message = 'rollback test data';
  exception when sqlstate 'P0001' then
    execute 'reset role';
  end;

  return query
    select c ->> 'n', (c ->> 'p')::boolean
    from jsonb_array_elements(checks) as c;
end;
$$;

select * from pg_temp.strauss_rls_test();
