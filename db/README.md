# db/ — схема Postgres (Supabase, проєкт `parkinsandr`, ЄС)

Джерело правди схеми. Кожен файл ідемпотентний. Порядок у таблиці — канонічний: саме в ньому файли
відтворюють схему з нуля. Лексичний порядок імен для цього не годиться: `announcement-deliveries`
посилається на `subscribers`. Узгодженість таблиці, файлів і коду стереже `tests/db-schema.test.js`.

| # | Файл | Статус |
|---|---|---|
| 1 | `2026-07-13-comments-baseline.sql` | Reconstructed 2026-10-12 |
| 2 | `2026-09-21-subscribers.sql` | Applied 2026-09-21 |
| 3 | `2026-09-21-subscribers-retention.sql` | Applied 2026-09-21 |
| 4 | `2026-09-21-announcement-deliveries.sql` | Applied 2026-09-21 |
| 5 | `2026-10-12-fk-indexes.sql` | Applied 2026-10-12 |

- **Applied `<дата>`** — цей файл застосовано на прод того дня.
- **Reconstructed `<дата>`** — таблиці створено раніше вручну; файл того дня відтворено з живої схеми.
- **Pending** — файл у репо, на проді його ще немає. Поки такий рядок є, він має стояти в `doc/STATE.md`.

## Нова міграція

1. Файл `db/<YYYY-MM-DD>-<що>.sql`, ідемпотентний (`if not exists`), статус — у першому коментарі файлу.
2. Рядок у таблиці вище, наступним номером, зі статусом `Pending`.
3. На проді індекси — лише `concurrently` і поза транзакцією; на сесію — `lock_timeout` і `statement_timeout`.
   NOT NULL, FK, зміна типу — за правилами expand/contract із глобальних стандартів, не одним `alter`.
4. Після застосування — `Applied <дата>` і в таблиці, і в коментарі файлу, одним комітом.

## Як застосувати файл на прод

Через `psql` і **сесійний** пулер — той самий хост, що в `DATABASE_URL`, але порт `5432` замість `6543`.
Транзакційний пулер не тримає `SET` між операторами. `psql -f` шле оператори по одному, без спільної
транзакції, тож `concurrently` працює. Локального `psql` немає — він є в образі Postgres:

```bash
docker run --rm -i postgres:17 psql "<URL сесійного пулера>" -v ON_ERROR_STOP=1 -f - < db/<файл>.sql
```

SQL Editor у Supabase для таких файлів не годиться: він не тримає сесійні `SET` між операторами,
а кілька операторів в одному запиті — це вже транзакція, у якій `concurrently` заборонено.

**Якщо прогін упав посередині** (таймаут, deadlock), просто запустіть файл ще раз. Невалідні залишки
`concurrently` він прибирає сам, а останній блок завершує прогін помилкою, поки обидва індекси не валідні.

**Відкат `2026-10-12-fk-indexes.sql`** — так само через `psql`, по одному оператору:

```sql
drop index concurrently if exists idx_comments_parent;
drop index concurrently if exists idx_deliveries_subscriber;
create index concurrently if not exists idx_comments_ip_created on comments (ip_hash, created_at);
```

## Відтворення з нуля

Чистий Postgres 17 + прелюдія того, що в Supabase є з коробки (схему `extensions` — у тій самій базі,
куди відтворюєте), далі файли за номерами через `psql -f`:

```sql
create role anon nologin;
create schema extensions;
alter role postgres set search_path = public, extensions;
```
