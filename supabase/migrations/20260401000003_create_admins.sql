-- Admin access table
-- Grants dashboard access by Supabase user ID.

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Only the service role (server) can read/write this table
alter table public.admins enable row level security;

-- No public policies — access is via service role key only
