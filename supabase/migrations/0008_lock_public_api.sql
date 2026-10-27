-- Supabase exposes the public schema through its REST API (PostgREST) to anyone holding the
-- publishable key, which the login page ships to the browser. This app never uses that API:
-- it connects to Postgres directly (as the postgres role, which bypasses RLS). So enable RLS
-- with NO policies on every table, which denies all access through the REST API.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Also revoke table privileges (and for future tables). Supabase-only roles; skipped on plain Postgres.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon, authenticated;
    alter default privileges in schema public revoke all on tables from anon, authenticated;
  end if;
end $$;
