// scripts/announce.mjs — the publish fan-out (feeds + Telegram channel). Only the pure parts are
// exercised here; sending is a network call the script makes behind --dry / explicit env.
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeSlug, hashtagFor, tgEscape, composePost, readItem, markSent } from '../scripts/announce.mjs';
import { HUB_MEMBERS, primaryHub } from '../scripts/link-policy.mjs';

const PUBLIC = join(process.cwd(), 'public');
const TELEGRAM_LIMIT = 4096;

describe('normalizeSlug', () => {
  it('accepts every shape a slug is pasted in', () => {
    for (const input of [
      'journal/hoverla',
      '/journal/hoverla/',
      'public/journal/hoverla/index.html',
      '/journal/hoverla/index.html',
      'https://www.parkinsandr.tech/journal/hoverla/',
    ]) {
      expect(normalizeSlug(input), input).toBe('journal/hoverla');
    }
  });
  it('rejects what is not a post path', () => {
    for (const bad of ['journal', '/journal/', 'journal/a/b', '', 'Journal/Hoverla', '../etc/passwd']) {
      expect(() => normalizeSlug(bad), bad).toThrow(/not a post slug/);
    }
  });
});

describe('hashtagFor', () => {
  it('uses the hub that owns the post, not articleSection', () => {
    // articleSection exists on 12 of 28 posts and disagrees with itself; the manifest is complete
    expect(hashtagFor('journal/hoverla')).toBe('#паркінсон');
    expect(hashtagFor('journal/kabachok-starosta')).toBe('#творчість');
    expect(hashtagFor('journal/velozaizd')).toBe('#журнал');
    expect(hashtagFor('blog/jarvis-ai-assistant')).toBe('#код');
    expect(hashtagFor('blog/react-vs-tilda')).toBe('#послуги');
  });
  it('falls back to the archive for something no hub owns', () => {
    expect(hashtagFor('journal/not-a-real-post')).toBe(`#${HUB_MEMBERS['blog/'].name.toLowerCase()}`);
  });
  it('is a single hashtag token — no spaces or punctuation', () => {
    for (const file of primaryHub().keys()) {
      const tag = hashtagFor(file.replace('/index.html', ''));
      expect(tag, file).toMatch(/^#[\p{L}\p{N}_]+$/u);
    }
  });
});

describe('tgEscape / composePost', () => {
  const item = {
    title: 'Заголовок & <script>',
    description: 'Опис із <b> і &amp;',
    link: 'https://www.parkinsandr.tech/journal/hoverla/',
  };

  it('escapes the characters Telegram HTML mode reserves', () => {
    expect(tgEscape('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(tgEscape('лапки "і" \'ті\'')).toBe('лапки "і" \'ті\''); // Telegram needs no quote escaping
  });

  it('puts the title in bold, the teaser, the bare link and one hashtag', () => {
    const text = composePost(item, 'journal/hoverla');
    expect(text.startsWith('<b>')).toBe(true);
    expect(text).toContain('Заголовок &amp; &lt;script&gt;');
    expect(text).toContain('Опис із &lt;b&gt; і &amp;amp;');
    expect(text).toContain(item.link); // bare, so Telegram renders the OG preview card
    expect(text.trimEnd().endsWith('#паркінсон')).toBe(true);
    expect(text.match(/#[\p{L}_]+/gu)).toHaveLength(1);
  });

  it('leaves no unescaped markup outside the one tag pair it adds', () => {
    const text = composePost(item, 'journal/hoverla').replace(/<\/?b>/g, '');
    expect(text).not.toMatch(/[<>]/);
  });

  it('skips the teaser when the post has no description', () => {
    const text = composePost({ ...item, description: '' }, 'journal/hoverla');
    expect(text).toBe(`<b>${tgEscape(item.title)}</b>\n\n${item.link}\n\n#паркінсон`);
  });
});

describe('readItem (against the real posts)', () => {
  const slugs = ['journal', 'blog'].flatMap((dir) =>
    readdirSync(join(PUBLIC, dir), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(PUBLIC, dir, d.name, 'index.html')))
      .map((d) => `${dir}/${d.name}`)
  );

  it('every published post can be announced, and the post fits one Telegram message', () => {
    expect(slugs.length).toBeGreaterThan(20);
    for (const slug of slugs) {
      const text = composePost(readItem(slug), slug);
      expect(text.length, `${slug}: over the Telegram limit`).toBeLessThan(TELEGRAM_LIMIT);
      expect(text, `${slug}: no canonical link`).toContain('https://www.parkinsandr.tech/');
    }
  });

  it('explains itself when the post does not exist', () => {
    expect(() => readItem('journal/nope')).toThrow(/no such post/);
  });
});

describe('announce state', () => {
  it('records the channel without mutating the state it was given', () => {
    const before = { 'journal/a': { tg: '2026-01-01T00:00:00.000Z' } };
    const after = markSent(before, 'journal/b', 'tg');
    expect(before['journal/b'], 'the input must not be mutated').toBeUndefined();
    expect(after['journal/a']).toEqual(before['journal/a']);
    expect(after['journal/b'].tg).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it('keeps the other channels of the same post', () => {
    const after = markSent({ 'journal/a': { email: 'x' } }, 'journal/a', 'tg');
    expect(after['journal/a'].email).toBe('x');
    expect(after['journal/a'].tg).toBeTruthy();
  });
});
