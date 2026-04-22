-- ── Widen plan_generations.reason check ──────────────────────────────────────
-- Adds 'test-runner' to the allowed reason values so we can tag generations
-- coming from the automated test dashboard (where the synthetic caller has
-- req.user.id === 'test-runner' and no matching auth.users row).
--
-- Without this row, admin_dashboard/src/app/dashboard/plan-generations/page.tsx
-- shows zero generations even when the test suite has been running plans
-- continuously — the inserts were silently failing the CHECK constraint.
--
-- See WORKFLOWS.md §"The real bug you're hitting" for the full story.

alter table public.plan_generations
  drop constraint if exists plan_generations_reason_check;

alter table public.plan_generations
  add constraint plan_generations_reason_check
    check (reason in (
      'generate',
      'regenerate',
      'admin-regenerate',
      'admin-rerun',
      'quick-plan',
      'test-runner',
      'other'
    ));

comment on column public.plan_generations.reason is
  'Origin of this plan-gen attempt. "test-runner" rows come from the automated test dashboard via TEST_API_KEY — filter them out to see real user activity.';
