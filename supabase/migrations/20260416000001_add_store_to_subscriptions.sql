-- Track which store an IAP subscription came from so the admin dashboard
-- can distinguish Apple IAP vs Google Play vs Stripe/coupon rows.
--
-- The RevenueCat webhook sends a `store` field on every event
-- (APP_STORE, PLAY_STORE, STRIPE, PROMOTIONAL, AMAZON, MAC_APP_STORE).
-- We persist it here, plus the raw product_id for debugging and for future
-- plan-grouping needs.
alter table public.subscriptions
  add column if not exists store      text,
  add column if not exists product_id text;

comment on column public.subscriptions.store is
  'Source store: APP_STORE | PLAY_STORE | STRIPE | PROMOTIONAL | AMAZON | MAC_APP_STORE. Null for legacy/Stripe rows.';
comment on column public.subscriptions.product_id is
  'Raw product/SKU id reported by the store (e.g. etapa_lifetime_v1).';

create index if not exists idx_subscriptions_store on public.subscriptions(store);
