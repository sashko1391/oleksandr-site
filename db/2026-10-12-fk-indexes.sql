-- Pending: apply by hand with psql (db/README.md), never inside a transaction — CONCURRENTLY refuses to run in one.
-- Covering indexes for the two foreign keys that had none (Supabase advisor «unindexed_foreign_keys», 2026-10-10),
-- and the (ip_hash, created_at) index nothing reads since the comment rate limit moved to KV. The two «unused»
-- indexes on subscribers stay: removing them is not worth a migration on a table of a few rows.
-- A CONCURRENTLY build that dies (timeout, deadlock) leaves an INVALID index under the same name, and IF NOT EXISTS
-- would then skip it: such leftovers are dropped first, and the last block fails the run unless both indexes are
-- valid and on the right columns. Rollback — db/README.md.
set lock_timeout = '5s';
set statement_timeout = '60s';

select format('drop index concurrently if exists public.%I', c.relname)
from pg_index i
join pg_class c on c.oid = i.indexrelid
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('idx_comments_parent', 'idx_deliveries_subscriber')
  and not i.indisvalid
\gexec

create index concurrently if not exists idx_comments_parent       on comments (parent_id);
create index concurrently if not exists idx_deliveries_subscriber on announcement_deliveries (subscriber_id);
drop index concurrently if exists idx_comments_ip_created;

do $$
declare
  bad text;
begin
  select string_agg(want.name, ', ') into bad
  from (values
    ('idx_comments_parent',       'CREATE INDEX idx_comments_parent ON public.comments USING btree (parent_id)'),
    ('idx_deliveries_subscriber', 'CREATE INDEX idx_deliveries_subscriber ON public.announcement_deliveries USING btree (subscriber_id)')
  ) as want(name, def)
  where not exists (
    select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
    where c.relnamespace = 'public'::regnamespace and c.relname = want.name
      and i.indisvalid and pg_get_indexdef(i.indexrelid) = want.def);
  if bad is not null then
    raise exception 'fk-indexes: % missing, invalid or on the wrong columns', bad;
  end if;
end $$;
