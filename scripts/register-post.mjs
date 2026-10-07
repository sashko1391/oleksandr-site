#!/usr/bin/env node
// Register a post slug in the `posts` table, so /api/comments stops answering 404 for it.
// Step 3 of the new-post checklist in AGENTS.md, without depending on an MCP connector.
//
// Usage:
//   npm run register:post -- journal/my-post        # insert if missing, then verify
//   npm run register:post -- journal/my-post --dry  # only report what is in the table
//
// DATABASE_URL comes from the environment or the gitignored .env, and must be the IPv4
// transaction pooler — the same URL the Vercel functions use (lib/db.js).
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { normalizeSlug } from './announce.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const USAGE = 'usage: register-post.mjs <section/slug> [--dry]';
const KNOWN_FLAGS = ['--dry'];

/** An unknown flag is a typo, and a typo must not silently become a no-op. */
export function parseArgs(argv) {
  const flags = argv.filter((a) => a.startsWith('--'));
  for (const flag of flags) {
    if (!KNOWN_FLAGS.includes(flag)) throw new Error(`unknown flag ${flag}\n${USAGE}`);
  }
  const rest = argv.filter((a) => !a.startsWith('--'));
  if (rest.length !== 1) throw new Error(USAGE);
  return { slug: normalizeSlug(rest[0]), dry: flags.includes('--dry') };
}

/** The page must exist before its slug does: a typo would otherwise create a row nothing points at. */
export function pageOf(slug, root = ROOT) {
  const file = join(root, 'public', slug, 'index.html');
  if (!existsSync(file)) throw new Error(`no such page: public/${slug}/index.html`);
  return file;
}

function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
    if (!m) continue;
    const value = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}

async function main(argv) {
  const { slug, dry } = parseArgs(argv);
  pageOf(slug);
  loadEnv();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set — put it in the gitignored .env');

  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: 'require', max: 1 });
  try {
    const before = await sql`SELECT slug FROM posts WHERE slug = ${slug}`;
    if (before.length) {
      console.log(`— ${slug}: already registered`);
      return;
    }
    if (dry) {
      console.log(`— ${slug}: not registered yet (--dry, nothing inserted)`);
      return;
    }
    await sql`INSERT INTO posts (slug) VALUES (${slug}) ON CONFLICT (slug) DO NOTHING`;
    const after = await sql`SELECT slug FROM posts WHERE slug = ${slug}`;
    if (!after.length) throw new Error(`${slug}: the row is still missing after the insert`);
    console.log(`— ${slug}: registered`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
