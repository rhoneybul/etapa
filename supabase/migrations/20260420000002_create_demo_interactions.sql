-- Track interactions with the interactive MCP demo on getetapa.com.
-- Lets us measure: which prompts get clicked most, which A/B CTA variant
-- converts better, and how the demo funnels into register_interest signups.
--
-- A single "demo session" = one page visit. The client generates a UUID
-- per page load and sends it with every event from that visit, so we can
-- reconstruct the full funnel (view → click → response → CTA click → signup).

create table if not exists public.demo_interactions (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null,           -- client-generated, groups a single visit
  event_type      text not null,           -- 'view' | 'prompt_click' | 'response_ok' | 'response_error' | 'cta_click' | 'signup'
  prompt_key      text,                    -- e.g. 'generate-plan', 'coach-adapt'
  cta_variant     text,                    -- 'A' or 'B' — which CTA treatment was shown
  referrer        text,
  user_agent      text,
  error_message   text,                    -- populated only for response_error events
  created_at      timestamptz not null default now()
);

-- Indexes for the admin stats queries
create index if not exists demo_interactions_session_idx on public.demo_interactions (session_id);
create index if not exists demo_interactions_event_type_idx on public.demo_interactions (event_type);
create index if not exists demo_interactions_created_at_idx on public.demo_interactions (created_at desc);
create index if not exists demo_interactions_prompt_key_idx on public.demo_interactions (prompt_key);
create index if not exists demo_interactions_cta_variant_idx on public.demo_interactions (cta_variant);

-- Optional link back to interest_signups so we can compute conversion rate
-- per variant. Stored as a nullable column on the signups table (added by
-- a separate ALTER below) so every signup from the demo carries its
-- originating session_id.
alter table public.interest_signups
  add column if not exists demo_session_id uuid;

create index if not exists interest_signups_demo_session_idx
  on public.interest_signups (demo_session_id);

alter table public.demo_interactions enable row level security;
-- No public policies — access is via the service role key only.
