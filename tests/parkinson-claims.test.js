// Ф2 step 2a: what the rubric asserts must be checkable, and a dose must never read as advice.
// The visible frame (policy block, correction log, review dates) arrives with step 2b — doc/HUBS_PLAN.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
const POSTS = ['diahnoz-u-27', 'rannii-parkinsonizm', 'parkinson-shcho-robyty', 'eksperyment-nad-soboyu', 'hoverla'];
const html = Object.fromEntries(POSTS.map((slug) => [slug, readFileSync(join(PUBLIC, 'journal', slug, 'index.html'), 'utf8')]));
/** The post without its corrections log: the log records past edits and may name what was removed. */
const body = (slug) => html[slug].replace(/<section class="corrections"[\s\S]*?<\/section>/, ' ');

/** Blocks of the article, in order, as (tag, text) — a dose warning may stand in the next block. */
function blocks(page) {
  // the corrections log quotes figures from past edits; it is a changelog, not advice
  const article = page.slice(page.indexOf('<article')).replace(/<section class="corrections"[\s\S]*?<\/section>/, ' ');
  return [...article.matchAll(/<(p|li|div)[^>]*>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({ tag: m[1], text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), at: m.index }));
}

// a quantity of medicine — digits or words, any unit — or the post's own scheme; not the bare word «таблетка»
// «одна таблетка» is the generic singular («одна таблетка нічого не доводить»), not a quantity taken
const NUMERAL = '(?:\\d+(?:\\s*\\/\\s*\\d+)?|дв[аіо]|три|чотири|пʼять|п\'ять|шість|сім|вісім|девʼять|дев\'ять|десять|півтори|половин[ау])';
const UNIT = '(?:мг|мкг|мл|міліграм\\p{L}*|таблет\\p{L}*|капсул\\p{L}*|пластир\\p{L}*|крапл\\p{L}*)';
const DOSE = new RegExp(`${NUMERAL}\\s*${UNIT}|мінімальн\\p{L}+ дози|(?:моє|власне|збільшував) дозуванн`, 'iu');
const WARNS = /(підбирає лікар|призначає лікар|не раджу це повторювати|не повторюйте|не як рекомендацію|питання до невролога|не схема, яку можна повторити|обговор\p{L}+ (?:це )?з (?:власним |)(?:лікар\p{L}*|неврологом))/iu;

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

  /** Figures checked against the sources on 2026-09-21: changing one here means going back to the source. */
  it('the medical figures are the ones the sources give', () => {
    const early = html['rannii-parkinsonizm'];
    expect(early, 'MDS-2015 applies the exclusion only from 600 mg/day').toContain('600 мг');
    expect(early).toContain('movementdisorders.onlinelibrary.wiley.com/doi/10.1002/mds.26424');
    expect(early, 'the MDS-UPDRS III threshold for a documented response').toContain('понад 30%');
    expect(early, 'employment figures come from the cohort, not from «10–15 років»')
      .toContain('через 5 років могли працювати 88%, через 10 років — 44%');
    expect(early).not.toMatch(/часто йдеться про 10–15 років/);
    expect(html['diahnoz-u-27'], 'a negative levodopa test is not a diagnosis on its own')
      .toContain('лише тоді, коли доза була щонайменше 600 мг на добу');
  });

  it('the self-experiment keeps its frame', () => {
    const post = html['eksperyment-nad-soboyu'];
    expect(post).toContain('Це щоденник однієї людини, а не дослідження й не медична порада');
    expect(post).toContain('не обговоривши з власним лікарем');
    expect(post, 'fasting is named as unproven').toMatch(/не доведено|недоведен/);
  });

  it('every post of the rubric carries current crisis contacts', () => {
    const withContacts = POSTS.filter((slug) => /howareu\.com\/hot-lines/.test(html[slug]));
    expect(withContacts).toEqual(POSTS);
    for (const slug of withContacts) {
      expect(body(slug), `${slug} still lists the paused 7333 line`).not.toMatch(/\b7333\b/);
      expect(html[slug], `${slug} must name the crisis line that answers`).toContain('0 800 21 01 60');
      expect(html[slug], `${slug} must say when the contacts were checked`).toMatch(/[Кк]онтакти перевірено/);
    }
  });

  it('an unverified number is not published at all, labelled or not', () => {
    // it used to say «палиці беруть на себе до 35% навантаження» on a driver's word — that is not a source
    expect(body('hoverla'), 'the figure may only survive in the corrections log').not.toMatch(/\d{1,3}\s?% навантаження/);
    expect(body('hoverla'), 'the experience stays, the figure goes').toContain('Цифр я не перевіряв і не наводжу');
  });
});
