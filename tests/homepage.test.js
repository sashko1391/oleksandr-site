// Ф3: the homepage is personal. It introduces the author, shows what is new in each section, and keeps
// exactly one commercial line — the menu item and the block at the end (doc/PERSONAL_SITE_PLAN.md).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
const SITE = 'https://www.parkinsandr.tech';
const home = readFileSync(join(PUBLIC, 'index.html'), 'utf8');
const services = readFileSync(join(PUBLIC, 'services', 'index.html'), 'utf8');

const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .flatMap((m) => { const d = JSON.parse(m[1]); return d['@graph'] ?? [d]; });
const node = (html, type) => ld(html).find((n) => [].concat(n['@type']).includes(type));

const SECTIONS = [
  { id: 'zhurnal', hub: '/journal/', title: 'Журнал' },
  { id: 'kod', hub: '/code/', title: 'Код' },
  { id: 'tvorchist', hub: '/creative/', title: 'Творчість' },
  { id: 'parkinson', hub: '/parkinson/', title: 'Паркінсон' },
];

describe('homepage', () => {
  it('introduces the person, not the service', () => {
    expect((home.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(home).toMatch(/<h1[^>]*>Олександр Кравченко<\/h1>/);
    const title = home.match(/<title>(.*?)<\/title>/)[1];
    expect(title.length, 'title under 60').toBeLessThan(60);
    expect(title).toContain('Олександр Кравченко');
    const description = home.match(/<meta name="description" content="([^"]*)"/)[1];
    expect(description.length).toBeLessThan(155);
    expect(home).toContain(`<link rel="canonical" href="${SITE}/">`);
  });

  it('carries Person and WebSite; the business node lives on /services/ with the same @id', () => {
    expect(node(home, 'Person')['@id'], 'the stable Person @id').toBe(`${SITE}/pro-mene/#author`);
    expect(node(home, 'WebSite'), 'WebSite').toBeDefined();
    expect(node(home, 'ProfessionalService'), 'the business node moved away from the homepage').toBeUndefined();
    const business = node(services, 'ProfessionalService');
    expect(business['@id'], 'AGENTS rule 3: the @id never changes').toBe(`${SITE}/#business`);
    expect(business.url, 'the node now describes /services/').toBe(`${SITE}/services/`);
  });

  it('shows each of the four sections with posts that exist', () => {
    for (const section of SECTIONS) {
      const block = home.match(new RegExp(`<section id="${section.id}"[\\s\\S]*?<\\/section>`))?.[0];
      expect(block, `no section ${section.id}`).toBeTruthy();
      expect(block, `${section.id}: links its hub`).toContain(`href="${section.hub}"`);
      const posts = [...block.matchAll(/<h3><a href="(\/[^"]+)">/g)].map((m) => m[1]);
      expect(posts.length, `${section.id}: too few posts`).toBeGreaterThanOrEqual(2);
      for (const url of posts) {
        expect(existsSync(join(PUBLIC, url.replace(/^\//, ''), 'index.html')), `${section.id}: ${url}`).toBe(true);
      }
      const dates = [...block.matchAll(/<time datetime="([^"]+)"/g)].map((m) => m[1]);
      expect([...dates].sort().reverse(), `${section.id}: newest first`).toEqual(dates);
    }
  });

  it('keeps commerce to the menu item and one block at the end', () => {
    const main = home.slice(home.indexOf('<main'), home.indexOf('</main>'));
    const body = main.replace(/<nav[\s\S]*?<\/nav>/g, ' ');
    const links = [...body.matchAll(/href="(\/services\/[^"]*)"/g)].map((m) => m[1]);
    expect(links.length, 'one commercial link in the body').toBe(1);
    const work = main.match(/<section id="robota"[\s\S]*?<\/section>/)[0];
    expect(work).toContain('href="/services/"');
    expect(main.indexOf('id="robota"'), 'the block comes after the sections')
      .toBeGreaterThan(main.indexOf('id="parkinson"'));
  });

  it('has no lead form and no bot — both live on /services/ now', () => {
    for (const marker of ['data-lead-form', 'chat-section', 'chatInput', 'oleksandr-site.sashko1391.workers.dev']) {
      expect(home, `homepage still contains ${marker}`).not.toContain(marker);
    }
    for (const marker of ['chat-section', 'chatInput']) {
      expect(services, `/services/ is missing ${marker}`).toContain(marker);
    }
  });

  it('links nothing by a homepage anchor any more', () => {
    expect(home, 'the old anchors are gone').not.toMatch(/href="#(chat-section|scenarios|portfolio|blog|pricing)"/);
  });

  it('declares the author photo at its real size', () => {
    const img = home.match(/<img class="hero-photo"[^>]*>/)[0];
    expect(img).toContain('src="/images/oleksandr.webp"');
    expect(img).toMatch(/width="480" height="480"/);
    expect(img).toContain('alt="Олександр Кравченко"');
  });
});
