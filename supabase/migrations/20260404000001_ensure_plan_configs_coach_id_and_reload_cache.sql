-- Ensure coach_id exists on plan_configs and refresh PostgREST schema cache.
alter table if exists public.plan_configs
  add column if not exists coach_id text;

do $$
begin
  -- Supabase/PostgREST picks this up to refresh cached table metadata.
  perform pg_notify('pgrst', 'reload schema');
exception
  when undefined_function then
    -- pg_notify is built-in, but keep migration resilient in restricted SQL runtimes.
    null;
end $$;
