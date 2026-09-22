import { describe, it, expect } from 'vitest';
import { CommentInput } from '../lib/schema.js';

const base = {
  slug: 'journal/vira-i-religiya',
  author_name: 'Оля',
  body: 'Гарний текст, дякую.',
  consent: true,
  turnstileToken: 'tok',
};

describe('CommentInput', () => {
  it('accepts a valid top-level comment', () => {
    expect(CommentInput.safeParse(base).success).toBe(true);
  });
  it('accepts a valid reply with positive parent_id', () => {
    expect(CommentInput.safeParse({ ...base, parent_id: 5 }).success).toBe(true);
  });
  it('lets a filled honeypot through the schema (rejected + logged at handler level)', () => {
    expect(CommentInput.safeParse({ ...base, hp: 'bot' }).success).toBe(true);
  });
  it('requires consent === true', () => {
    expect(CommentInput.safeParse({ ...base, consent: false }).success).toBe(false);
  });
  it('rejects empty body and over-long name', () => {
    expect(CommentInput.safeParse({ ...base, body: '   ' }).success).toBe(false);
    expect(CommentInput.safeParse({ ...base, author_name: 'x'.repeat(61) }).success).toBe(false);
  });
  it('rejects non-positive / non-integer parent_id', () => {
    expect(CommentInput.safeParse({ ...base, parent_id: 0 }).success).toBe(false);
    expect(CommentInput.safeParse({ ...base, parent_id: -3 }).success).toBe(false);
    expect(CommentInput.safeParse({ ...base, parent_id: 1.5 }).success).toBe(false);
  });
  it('trims and enforces max body length', () => {
    expect(CommentInput.safeParse({ ...base, body: 'a'.repeat(4001) }).success).toBe(false);
  });
});

describe('the author entity is one identity everywhere', () => {
  const { readFileSync, readdirSync, statSync } = require('node:fs');
  const { join } = require('node:path');
  const PUB = join(process.cwd(), 'public');
  const AUTHOR = 'https://www.parkinsandr.tech/pro-mene/#author';
  const files = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : n.endsWith('.html') ? [p] : [];
  });
  /** Every JSON-LD node that DEFINES the author (carries sameAs), wherever it sits in the graph. */
  const definitions = () => {
    const out = [];
    const walk = (node, file) => {
      if (Array.isArray(node)) return node.forEach((n) => walk(n, file));
      if (!node || typeof node !== 'object') return;
      if (node['@id'] === AUTHOR && Array.isArray(node.sameAs)) out.push({ file, sameAs: node.sameAs });
      Object.values(node).forEach((v) => walk(v, file));
    };
    for (const f of files(PUB)) {
      const html = readFileSync(f, 'utf8');
      for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        walk(JSON.parse(m[1]), f.slice(PUB.length + 1));
      }
    }
    return out;
  };

  it('every page that defines the author lists the same profiles', () => {
    const defs = definitions();
    expect(defs.length, 'the author must be defined somewhere').toBeGreaterThan(1);
    const [first, ...rest] = defs;
    for (const d of rest) {
      expect(d.sameAs, `${d.file} disagrees with ${first.file} about who the author is`).toEqual(first.sameAs);
    }
  });

  it('carries no share-tracking parameters — they identify whoever copied the link', () => {
    for (const { file, sameAs } of definitions()) {
      for (const url of sameAs) {
        expect(url, `${file}: ${url}`).not.toMatch(/[?&](si|_r|_t|utm_[a-z]+|igsh|fbclid)=/);
      }
    }
  });

  it('shows every profile it claims, visibly, on the author page', () => {
    const html = readFileSync(join(PUB, 'pro-mene', 'index.html'), 'utf8');
    const def = definitions().find((d) => d.file === 'pro-mene/index.html');
    const social = html.split('class="profile-social"')[1].split('</div>')[0];
    for (const url of def.sameAs) {
      expect(social, `${url} is in sameAs but not on the page`).toContain(`href="${url}"`);
    }
  });
});
