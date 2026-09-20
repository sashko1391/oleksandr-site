// Ф2 step 2a: what the rubric asserts must be checkable, and a dose must never read as advice.
// The visible frame (policy block, correction log, review dates) arrives with step 2b — doc/HUBS_PLAN.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
const POSTS = ['diahnoz-u-27', 'rannii-parkinsonizm', 'parkinson-shcho-robyty', 'eksperyment-nad-soboyu', 'hoverla'];
const html = Object.fromEntries(POSTS.map((slug) => [slug, readFileSync(join(PUBLIC, 'journal', slug, 'index.html'), 'utf8')]));

/** Blocks of the article, in order, as (tag, text) — a dose warning may stand in the next block. */
function blocks(page) {
  const article = page.slice(page.indexOf('<article'));
  return [...article.matchAll(/<(p|li|div)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({ tag: m[1], text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), at: m.index }));
}

// a quantity of medicine, or the post's own scheme — not the word «таблетка» in a general sentence
const DOSE = /\d+\s*\/?\s*\d*\s*(?:мг|міліграм|таблет|пластир)|мінімальної дози|(?:моє|власне|збільшував) дозуванн/i;
const WARNS = /(підбирає лікар|призначає лікар|не раджу це повторювати|не повторюйте|не як рекомендацію|питання до невролога|обговор\w+ (?:це )?з (?:власним |)(?:лікар|неврологом))/i;

describe('Parkinson rubric — claims and doses', () => {
  it('every dose mentioned carries a warning in the same block or right next to it', () => {
    for (const slug of POSTS) {
      const bs = blocks(html[slug]);
      bs.forEach((b, i) => {
        if (!DOSE.test(b.text) || b.text.length < 40) return;
        const near = [bs[i - 1], b, bs[i + 1], bs[i + 2]].filter(Boolean).map((x) => x.text).join(' ');
        expect(WARNS.test(near), `${slug}: «${b.text.slice(0, 90)}…» has no warning next to it`).toBe(true);
      });
    }
  });

  it('no dose is presented as something to copy', () => {
    for (const slug of POSTS) {
      const text = html[slug].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      expect(text, slug).not.toMatch(/почніть з|приймайте|пийте по|раджу приймати/i);
    }
  });

  it('the two review posts keep a sources section', () => {
    for (const slug of ['rannii-parkinsonizm', 'parkinson-shcho-robyty']) {
      expect(html[slug], slug).toMatch(/<h2[^>]*>\s*Джерела\s*<\/h2>/);
      const links = [...html[slug].matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
      const authoritative = links.filter((u) => /pubmed|pmc\.ncbi|nejm|jamanetwork|nice\.org|fda\.gov|accessdata\.fda|clinicaltrials|orphanet|sagepub|mdsgene/i.test(u));
      expect(authoritative.length, `${slug}: too few primary sources`).toBeGreaterThanOrEqual(5);
    }
  });

  it('a manufacturer press release is never the source', () => {
    for (const slug of POSTS) {
      expect(html[slug], slug).not.toMatch(/news\.abbvie\.com|prnewswire\.com|businesswire\.com|investors\.[a-z]+\.com|drugs\.com/i);
    }
  });

  it('the self-started levodopa passage says plainly that it is not a model', () => {
    const post = html['diahnoz-u-27'];
    expect(post).toContain('Так робити не треба, і я не раджу це повторювати.');
    expect(post).toMatch(/Дозу й схему підбирає лікар/);
  });

  it('the personal medication scheme says who decides the dose', () => {
    expect(html['hoverla']).toContain('Це моя особиста схема, підібрана під мене.');
    expect(html['hoverla']).toContain('Дозування та час прийому підбирає лікар');
  });

  it('the crisis contacts are current on every post that carries them', () => {
    for (const slug of POSTS) {
      if (!/гаряч|криз|підтримк/i.test(html[slug])) continue;
      expect(html[slug], `${slug} still lists the paused 7333 line`).not.toMatch(/\b7333\b/);
    }
  });

  it('hearsay is labelled as hearsay', () => {
    expect(html['hoverla']).toMatch(/цифру я не перевіряв, це його слова/);
  });
});
