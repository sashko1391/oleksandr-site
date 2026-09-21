-- When someone unsubscribed, so the retention cron can erase the address 30 days later
-- (doc/SUBSCRIPTION_PLAN.md, Фаза 1.5 — storage limitation). Applied 2026-09-21.
alter table subscribers add column if not exists unsubscribed_at timestamptz;
create index if not exists idx_subscribers_unsubscribed_at on subscribers (unsubscribed_at);
