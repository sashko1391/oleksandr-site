-- Reconstructed 2026-10-12 from the live schema of project `parkinsandr`: the tables were created 2026-07-13 in the
-- SQL Editor (design — doc/COMMENTS_PLAN.md §4.1) and had no file until now. Idempotent: replaying it on production
-- changes nothing. Comment whitelist: a comment can only belong to a registered page (`npm run register:post`).
create table if not exists posts (
  slug text primary key                                            -- 'journal/vira-i-religiya', 'blog/react-vs-tilda', …
);

create table if not exists comments (
  id          bigint generated always as identity primary key,
  slug        text not null references posts(slug) on delete cascade,
  parent_id   bigint references comments(id) on delete cascade,    -- one level of replies; NULL = top level
  author_name text not null,
  body        text not null,
  status      text not null default 'pending'
                check (status in ('pending', 'approved', 'spam', 'deleted')),
  ip_hash     text,                                                -- HMAC of the /64 prefix; NULL after 30 days (cron)
  created_at  timestamptz not null default now()
);

create index if not exists idx_comments_slug_status on comments (slug, status);
create index if not exists idx_comments_created     on comments (created_at);          -- retention cron
create index if not exists idx_comments_ip_created  on comments (ip_hash, created_at); -- unread since the rate limit moved to KV

-- Safety net only: the functions connect as `postgres` (table owner, BYPASSRLS), so RLS does not apply to them and
-- authorisation lives in their code.
-- A leaked anon key reads the page list and the approved comments, which are public anyway — and nothing else.
alter table posts enable row level security;
alter table comments enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'posts' and policyname = 'posts_anon_select') then
    create policy posts_anon_select on posts for select to anon using (true);
  end if;
  if not exists (select 1 from pg_policies
                 where schemaname = 'public' and tablename = 'comments' and policyname = 'comments_anon_select') then
    create policy comments_anon_select on comments for select to anon using (status = 'approved');
  end if;
end $$;
