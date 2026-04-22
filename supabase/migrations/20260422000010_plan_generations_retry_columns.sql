-- ── plan_generations — retry + post-processor violation columns ──────────────
-- Captures the output of the new second-pass retry loop and the deterministic
-- post-processor clamps so admins can see:
--   - How many structural issues were auto-corrected on the first pass
--   - Whether a retry was triggered, and if so, whether it helped
--   - Exactly which constraints were violated (code + stage + message)
--
-- Without these columns the retry + clamp info only lives on the in-memory
-- job object and is lost as soon as the job ages out of planJobs.

alter table public.plan_generations
  add column if not exists post_processor_violations jsonb,
  add column if not exists retry_attempted           boolean default false,
  add column if not exists retry_critical_count      integer;

comment on column public.plan_generations.post_processor_violations is
  'Array of {stage, code, severity, message} objects from planPostProcessors.runAll. Represents the structural issues auto-corrected after Claude returned its plan.';
comment on column public.plan_generations.retry_attempted is
  'True if critical violations on the first pass triggered a second Claude call with corrective feedback.';
comment on column public.plan_generations.retry_critical_count is
  'Number of critical violations remaining after the retry pass. NULL if no retry happened. A number less than the first-pass count means the retry was accepted.';
