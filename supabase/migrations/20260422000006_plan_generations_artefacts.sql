-- ── plan_generations — full debug artefacts ──────────────────────────────────
-- Extends plan_generations with the fields a reviewer needs to reproduce and
-- critique a generation end-to-end:
--   system_prompt  — the coach-persona-enhanced system prompt sent to Claude
--   prompt         — the user-turn message with goal + config expanded
--   raw_response   — the raw text Claude returned (before speed normalisation)
--   activities     — the final activities array after normalisation + dates
--   plan_snapshot  — plan-level metadata (name, weeks, startDate, currentWeek)
--
-- Size: a 20-week expert plan prompt+response is ~30-50 KB. Postgres handles
-- jsonb/text up to ~1 GB per field so we have plenty of headroom. We compress
-- the prompt to its unique body — the system prompt is mostly boilerplate,
-- but on failures it matters that the reviewer can see exactly what was sent.

alter table public.plan_generations
  add column if not exists system_prompt  text,
  add column if not exists prompt         text,
  add column if not exists raw_response   text,
  add column if not exists activities     jsonb,
  add column if not exists plan_snapshot  jsonb;

comment on column public.plan_generations.system_prompt is
  'The system prompt (with coach persona block) sent to Claude. Captured once at job start.';
comment on column public.plan_generations.prompt is
  'The user-turn prompt expanded from goal + config. Captured once at job start.';
comment on column public.plan_generations.raw_response is
  'First 50KB of Claude''s raw text response. Captured on success and parse failure alike.';
comment on column public.plan_generations.activities is
  'Final saved activities array after speed normalisation + one-off injection.';
comment on column public.plan_generations.plan_snapshot is
  'Plan-level metadata: {id, name, weeks, startDate, currentWeek}. Captured alongside activities.';
