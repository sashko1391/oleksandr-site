-- Per-recipient delivery log for the newsletter (doc/SUBSCRIPTION_PLAN.md, Фаза 2). Applied 2026-09-21.
-- Per recipient, not per post: a run that dies on the 50th letter must not mark the whole announcement
-- sent and silently skip the other half on the next try.
create table if not exists announcement_deliveries (
  slug          text   not null,
  subscriber_id bigint not null references subscribers(id) on delete cascade,
  status        text   not null check (status in ('sending', 'sent', 'failed')),
  resend_id     text,
  error         text,
  updated_at    timestamptz not null default now(),
  primary key (slug, subscriber_id)
);

create index if not exists idx_deliveries_slug_status on announcement_deliveries (slug, status);

alter table announcement_deliveries enable row level security; -- as with subscribers: no policies
