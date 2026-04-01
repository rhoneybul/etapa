-- Etapa subscriptions — tracks Stripe subscription state per user

create table if not exists public.subscriptions (
  id                    text primary key,          -- Stripe subscription ID
  user_id               uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id    text not null,
  plan                  text not null,             -- 'monthly' | 'annual'
  status                text not null,             -- 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete'
  trial_end             timestamptz,
  current_period_end    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions for select using (auth.uid() = user_id);

create index if not exists idx_subscriptions_user on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(user_id, status);
