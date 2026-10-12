// db/ is the source of truth for the schema (AGENTS.md): every table the code queries must be created by a
// migration in the repo, the manifest in db/README.md must list every file in an order that replays cleanly,
// and every file must say whether it is applied to production. Before 2026-10 `posts` and `comments` lived only
// as prose in doc/COMMENTS_PLAN.md, and the lexical file order put a foreign key before the table it points at.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DB = join(ROOT, 'db');

function files(dir, re) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p, re));
    else if (re.test(name)) out.push(p);
  }
  return out;
}

const KEYWORDS = new Set(['set', 'only', 'lateral', 'select']);

/** Table names inside the SQL template literals of the code — not comments, not arbitrary strings. */
function tablesInCode() {
  const sources = [
    ...files(join(ROOT, 'api'), /\.js$/),
    ...files(join(ROOT, 'lib'), /\.js$/),
    ...files(join(ROOT, 'scripts'), /\.mjs$/),
  ];
  const found = new Map();
  for (const file of sources) {
    for (const [, query] of readFileSync(file, 'utf8').matchAll(/\bsql`([\s\S]*?)`/g)) {
      for (const [, table] of query.matchAll(/\b(?:from|into|update|join)\s+([a-z_][a-z0-9_]*)/gi)) {
        const name = table.toLowerCase();
        if (KEYWORDS.has(name)) continue; // `ON CONFLICT … DO UPDATE SET`, `FROM LATERAL …`
        if (!found.has(name)) found.set(name, file.slice(ROOT.length + 1));
      }
    }
  }
  return found;
}

/** The manifest: `| N | \`file.sql\` | Status |` rows of the table in db/README.md, in order. */
function manifest() {
  const readme = readFileSync(join(DB, 'README.md'), 'utf8');
  return [...readme.matchAll(/^\|\s*(\d+)\s*\|\s*`([^`]+\.sql)`\s*\|\s*([^|]+?)\s*\|/gm)].map((m) => ({
    n: Number(m[1]),
    file: m[2],
    status: m[3],
  }));
}

const STATUS = /^(Applied \d{4}-\d{2}-\d{2}|Reconstructed \d{4}-\d{2}-\d{2}|Pending)$/;
/** SQL without comments and string literals — so a table name in a message or a comment is never «used». */
const strip = (sql) => sql.replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");

const ID = '(?:public\\.)?([a-z_][a-z0-9_]*)';
const STATEMENTS = new RegExp(
  [
    `\\bcreate table if not exists\\s+${ID}`, // 1: creates
    `\\breferences\\s+${ID}\\s*\\(`, // 2: uses
    `\\balter table\\s+(?:if exists\\s+)?${ID}`, // 3: uses
    `\\bon\\s+${ID}\\s*\\(`, // 4: uses — create index … on t (…)
    `\\bcreate policy\\s+[a-z_][a-z0-9_]*\\s+on\\s+${ID}`, // 5: uses
  ].join('|'),
  'gi'
);

/**
 * Walk the files in order, statement by statement: every use of a table must come after its CREATE TABLE —
 * across files and inside one. Returns the violations as readable strings.
 * @param {{ file: string, body: string }[]} ordered
 */
function orderViolations(ordered) {
  const created = new Set();
  const bad = [];
  for (const { file, body } of ordered) {
    for (const m of strip(body).matchAll(STATEMENTS)) {
      if (m[1]) { created.add(m[1].toLowerCase()); continue; }
      const used = (m[2] || m[3] || m[4] || m[5]).toLowerCase();
      if (!created.has(used)) bad.push(`${file}: ${m[0].trim()} — ${used} is not created yet`);
    }
  }
  return bad;
}

const createdBy = (ordered) =>
  new Set(ordered.flatMap(({ body }) => [...strip(body).matchAll(STATEMENTS)].filter((m) => m[1]).map((m) => m[1].toLowerCase())));
const ordered = () => manifest().map(({ file }) => ({ file, body: readFileSync(join(DB, file), 'utf8') }));

describe('db/ is the source of truth for the schema', () => {
  it('has a manifest that lists every migration exactly once, in a numbered order', () => {
    expect(existsSync(join(DB, 'README.md')), 'db/README.md is the manifest').toBe(true);
    const rows = manifest();
    const onDisk = readdirSync(DB).filter((n) => n.endsWith('.sql')).sort();
    expect(rows.map((r) => r.file).sort()).toEqual(onDisk);
    expect(rows.map((r) => r.n)).toEqual(rows.map((_, i) => i + 1));
  });

  it('says for every file whether production has it, and the file agrees with the manifest', () => {
    for (const { file, status } of manifest()) {
      expect(status, file).toMatch(STATUS);
      // the leading comment block of the file — the status may sit on its second line
      const lines = readFileSync(join(DB, file), 'utf8').split('\n');
      const header = lines.slice(0, lines.findIndex((l) => !l.startsWith('--'))).join('\n');
      const [word, date] = status.split(' ');
      expect(header, `${file}: the header comment must carry the same status`).toContain(word);
      if (date) expect(header, `${file}: …and the same date as the manifest`).toContain(date);
    }
  });

  it('replays in manifest order: nothing references, alters, indexes or guards a table before it exists', () => {
    expect(orderViolations(ordered())).toEqual([]);
  });

  it('the order check itself catches what it claims to (inside a file, policies, schema prefixes)', () => {
    const one = (body) => orderViolations([{ file: 'x.sql', body }]);
    expect(one('alter table t enable row level security;\ncreate table if not exists t (id int);')).toHaveLength(1);
    expect(one('create policy p on public.t for select to anon using (true);\ncreate table if not exists t (id int);')).toHaveLength(1);
    expect(one('create index if not exists i on public.t (id);')).toHaveLength(1);
    expect(one('create table if not exists t (id int references t(id));\nalter table public.t enable row level security;')).toEqual([]);
    // a table named inside a comment or a string is not a use
    expect(one("-- alter table ghost\nselect 'on ghost (x)';")).toEqual([]);
  });

  it('creates every table the code queries', () => {
    const created = createdBy(ordered());
    const used = tablesInCode();
    expect(used.size, 'the extractor must find the queries at all').toBeGreaterThanOrEqual(4);
    const missing = [...used].filter(([t]) => !created.has(t)).map(([t, where]) => `${t} (${where})`);
    expect(missing).toEqual([]);
  });
});
