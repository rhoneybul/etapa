-- Pre-launch "register interest" email capture from the marketing website.
-- Writes are public (via the Node API using the service role key), reads are
-- restricted to the service role — surfaced to admins through /api/admin/signups.

create table if not exists public.interest_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text,           -- page the signup came from (e.g. 'index', 'support', 'blog/...')
  referrer    text,
  user_agent  text,
  created_at  timestamptz not null default now()
);

-- De-dupe on lowercase email so we don't spam Slack on repeat submissions.
create unique index if not exists interest_signups_email_lower_idx
  on public.interest_signups (lower(email));

create index if not exists interest_signups_created_at_idx
  on public.interest_signups (created_at desc);

alter table public.interest_signups enable row level security;
-- No public policies — access is via the service role key only.
