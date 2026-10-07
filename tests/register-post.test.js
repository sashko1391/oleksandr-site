// scripts/register-post.mjs is the step that keeps /api/comments from answering 404 for a new post.
// It must refuse everything that would put a wrong row into `posts` — and never touch the database
// to find that out. These checks cover the two guards that run before any connection is opened.
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs, pageOf } from '../scripts/register-post.mjs';

const ROOT = join(import.meta.dirname, '..');

describe('register-post — arguments', () => {
  it('accepts a slug and the forms a page URL arrives in', () => {
    for (const input of [
      'journal/kabachok-starosta-seriya-2',
      '/journal/kabachok-starosta-seriya-2/',
      'public/journal/kabachok-starosta-seriya-2/index.html',
      'https://www.parkinsandr.tech/journal/kabachok-starosta-seriya-2/',
    ]) {
      expect(parseArgs([input]).slug, input).toBe('journal/kabachok-starosta-seriya-2');
    }
  });

  it('refuses what is not a post slug', () => {
    for (const input of ['journal', 'journal/a/b', 'Journal/Post', '']) {
      expect(() => parseArgs([input]), input).toThrow();
    }
  });

  it('refuses an unknown flag instead of ignoring it', () => {
    expect(() => parseArgs(['journal/sarai', '--force'])).toThrow(/unknown flag/);
    expect(parseArgs(['journal/sarai', '--dry'])).toEqual({ slug: 'journal/sarai', dry: true });
  });

  it('needs exactly one slug', () => {
    expect(() => parseArgs([])).toThrow();
    expect(() => parseArgs(['journal/sarai', 'journal/hoverla'])).toThrow();
  });
});

describe('register-post — the page must exist first', () => {
  it('resolves a real post to its file', () => {
    expect(existsSync(pageOf('journal/sarai'))).toBe(true);
  });

  it('throws for a slug with no page, so a typo cannot create a dangling row', () => {
    expect(() => pageOf('journal/no-such-post')).toThrow(/no such page/);
  });

  it('accepts every journal and blog post the site actually has', () => {
    for (const section of ['journal', 'blog']) {
      for (const name of readdirSync(join(ROOT, 'public', section), { withFileTypes: true })) {
        if (!name.isDirectory()) continue;
        if (!existsSync(join(ROOT, 'public', section, name.name, 'index.html'))) continue;
        expect(() => pageOf(`${section}/${name.name}`), name.name).not.toThrow();
      }
    }
  });
});
