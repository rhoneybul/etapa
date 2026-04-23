-- ──────────────────────────────────────────────────────────────────────────
-- cost_items — per-item one-shot override for "this month is abnormal".
--
-- The normal monthly_amount is the steady-state expectation (e.g. Anthropic
-- £115/mo). Sometimes the founder knows next month will be way off — a bulk
-- Claude test run pushes it to £300, or a one-off Apple Developer renewal
-- hits. Rather than polluting the steady-state number (which is used for
-- runway calculations) we store the exception separately:
--
--   next_month_override  → what you expect the next charge to be
--   override_note        → why
--   override_set_at      → when you flagged it
--
-- The dashboard's "expected next month burn" KPI uses these when set and
-- falls back to monthly_amount otherwise. The override auto-clears from the
-- calc once the next charge date passes — no need for the user to manually
-- reset it — but we leave the fields in place as history.
-- ──────────────────────────────────────────────────────────────────────────

alter table finance.cost_items
  add column if not exists next_month_override numeric(10,2),
  add column if not exists override_note        text,
  add column if not exists override_set_at      timestamptz;

comment on column finance.cost_items.next_month_override is
  'If set, replaces monthly_amount for the NEXT billing period in the expected-burn KPI. Leave null for steady-state. User can flag this when they know a charge will be abnormal (e.g. bulk test run on Anthropic).';
