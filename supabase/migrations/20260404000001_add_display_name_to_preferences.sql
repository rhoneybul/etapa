-- Add display_name and onboarding_done columns to user_preferences
alter table public.user_preferences
  add column if not exists display_name text default null;

alter table public.user_preferences
  add column if not exists onboarding_done boolean not null default false;
