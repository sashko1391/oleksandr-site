-- Email subscription (doc/SUBSCRIPTION_PLAN.md, Фаза 1.1). Applied to project `parkinsandr` 2026-09-21.
-- Idempotent: safe to re-run. Nothing here stores a token in clear text.

-- Case-insensitive email, unique across case variants. Into `extensions`, not `public`: Supabase's
-- linter flags a public-schema extension, since everything in public is reachable through the API.
create extension if not exists citext with schema extensions;

create table if not exists subscribers (
  id                     bigint generated always as identity primary key,
  email                  citext unique,          -- NULL after erasure; email_hash stays as the suppression key
  status                 text not null default 'pending'
                           check (status in ('pending', 'confirmed', 'unsubscribed')),
  -- HMAC(EMAIL_HASH_SECRET, lower(email)). Survives erasure of the address itself, so a person who
  -- unsubscribed is never re-added silently. Never reversible to the address.
  email_hash             text not null,
  -- sha256(raw token). The raw token exists only in the email/URL: a database leak hands out no
  -- bearer keys for confirm/unsubscribe.
  confirm_token_hash     text,                   -- cleared once confirmed (single use)
  unsubscribe_token_hash text not null,          -- NEVER cleared: archived emails still link it
  topics                 text[] not null default '{}'::text[]
                           check (topics <@ array['parkinson', 'code', 'creative', 'journal']),
  consent_at             timestamptz,            -- proof of consent, with ip_hash
  confirmed_at           timestamptz,
  ip_hash                text,                   -- HMAC of the /64 prefix, as in comments
  source                 text,                   -- which page the subscription came from
  confirm_sent_at        timestamptz,            -- durable cooldown: outlives an ephemeral KV counter
  confirm_send_count     int not null default 0,
  created_at             timestamptz not null default now()
);

-- Lookups are all by hash or status; the address itself is only ever matched exactly.
create index if not exists idx_subscribers_status      on subscribers (status);
create index if not exists idx_subscribers_confirm     on subscribers (confirm_token_hash);
create index if not exists idx_subscribers_unsubscribe on subscribers (unsubscribe_token_hash);
create index if not exists idx_subscribers_email_hash  on subscribers (email_hash);
create index if not exists idx_subscribers_created     on subscribers (created_at); -- retention cron

-- A row must keep the one identifier it is allowed to keep after erasure.
alter table subscribers drop constraint if exists subscribers_identifiable;
alter table subscribers add constraint subscribers_identifiable
  check (email is not null or status = 'unsubscribed');

-- Safety net only: the serverless functions connect as the pooler role and bypass RLS, so access
-- control lives in the handlers. This keeps a leaked anon key from reading the list.
alter table subscribers enable row level security;
