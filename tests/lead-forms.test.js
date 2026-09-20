// Every lead form on the site goes through the shared honest module: success only after the Worker
// confirms, no page-local copy of the sending logic, and a usable page without JavaScript.
// Rule 13 of AGENTS.md (правдивість) — a form must not claim a lead it did not deliver.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PUBLIC = join(process.cwd(), 'public');
const SCRIPT = '/js/lead-form.v1.js';
const WORKER = 'oleksandr-site.sashko1391.workers.dev';

function htmlFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...htmlFiles(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const pages = htmlFiles(PUBLIC).map((file) => ({
  rel: relative(PUBLIC, file).split(sep).join('/'),
  html: readFileSync(file, 'utf8'),
}));
const formPages = pages.filter((p) => /<form[^>]+data-lead-form/i.test(p.html));
const shared = readFileSync(join(PUBLIC, 'js', 'lead-form.v1.js'), 'utf8');

/** The form element itself, so a rule about the form is not satisfied by markup elsewhere on the page. */
const formTags = (html) => html.match(/<form[^>]+data-lead-form[^>]*>/gi) ?? [];

describe('lead forms', () => {
  it('there are exactly seven of them: /services/, five landings and the /pricing/ brief', () => {
    expect(formPages.map((p) => p.rel).sort()).toEqual([
      'pricing/index.html',
      'services/ai/index.html',
      'services/index.html',
      'services/kyiv/index.html',
      'services/landing/index.html',
      'services/nextjs/index.html',
      'services/redesign/index.html',
    ]);
  });

  it('each one loads the shared module and gives it a label', () => {
    for (const page of formPages) {
      expect(page.html, page.rel).toContain(`src="${SCRIPT}"`);
      for (const tag of formTags(page.html)) expect(tag, page.rel).toMatch(/data-label="[a-z_]+_form"/);
    }
  });

  it('each one has a contact field the module can read', () => {
    for (const page of formPages) {
      expect(page.html, page.rel).toMatch(/<(input|textarea)[^>]+name="(contact|phone)"/);
    }
  });

  it('no page keeps its own sending logic', () => {
    for (const page of pages) {
      if (page.rel === 'index.html') continue; // the homepage bot has its own queue
      expect(page.html, page.rel).not.toMatch(/function\s+(submitLead|submitBrief)/);
      expect(page.html, page.rel).not.toContain(WORKER);
    }
  });

  it('only the shared module and the homepage bot talk to the Worker', () => {
    const talking = pages.filter((p) => p.html.includes(WORKER)).map((p) => p.rel);
    expect(talking).toEqual(['index.html']);
    expect(shared).toContain(WORKER);
  });

  it('without JavaScript the form is hidden and the direct contacts stay reachable', () => {
    for (const page of formPages) {
      const noscript = page.html.match(/<noscript>[\s\S]*?<\/noscript>/i)?.[0] ?? '';
      const id = formTags(page.html)[0].match(/id="([^"]+)"/)[1];
      expect(noscript, page.rel).toContain(`#${id} { display: none; }`);
      expect(noscript, page.rel).toMatch(/лише з увімкненим JavaScript/);
      // either in the note itself or elsewhere on the page, outside the hidden confirmation block
      const visibleContacts = page.html.replace(/<div id="[^"]*[Ss]uccess"[\s\S]*?<\/div>/, '');
      expect(visibleContacts, page.rel).toMatch(/https:\/\/t\.me\//);
    }
  });

  it('the module hides the form and reports a lead only after a 2xx answer', () => {
    expect(shared).toMatch(/if \(!res\.ok\) throw/);
    expect(shared).toMatch(/new AbortController\(\)/);
    expect(shared).toContain('signal: controller.signal'); // the request must actually be abortable
    expect(shared).toMatch(/setTimeout\(function \(\) \{ controller\.abort\(\); \}, TIMEOUT_MS\)/);
    expect(shared).toMatch(/form\.style\.display = 'none'/); // author CSS beats the hidden attribute
    // generate_lead is fired in the then-branch, never in catch
    const [, after] = shared.split('.catch(function (error)');
    expect(after).not.toContain('generate_lead');
  });

  it('the module never reports success on an error path', () => {
    const catchBody = shared.split('.catch(function (error)')[1].split('});')[0];
    expect(catchBody).toContain('FAIL_TEXT');
    expect(catchBody).not.toContain('succeed(');
  });
});
