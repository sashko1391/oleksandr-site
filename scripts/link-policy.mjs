// Migration policy for scripts/check-links.mjs (layer B), phases of doc/PERSONAL_SITE_PLAN.md.
// Which homepage anchors other pages may still reference; manifest links (identified by their text, so
// a link repointed to the wrong target is still found); position-2 breadcrumbs; exact entity @id counts.
// Ф1 step 3 (scripts/repoint-anchors.mjs) flips CURRENT_PHASE to 'f1-done' in the same commit.
export const SITE = 'https://www.parkinsandr.tech';

/** Personal contact for «напишіть мені» error reports (owner decision 2026-09-18) — not the sales chat. */
export const PERSONAL_CONTACT = 'https://t.me/+380936429885';

const TALK = 'Обговорити проєкт →';
const AI = 'Поговорити з AI →';
const HELPER = 'AI-помічником';
const CASE = 'Обговорити ваш проєкт';

/** R1 of Ф1 before step 3: commercial chat CTAs, file → anchor texts (25 in 22 files). Unlisted files are unconstrained. */
const CTA_BEFORE = {
  'blog/chek-list-zamovlennya-sajtu/index.html': [TALK],
  'blog/devlog-business-empire-idle/index.html': [TALK],
  'blog/devlog-empire-online/index.html': [TALK],
  'blog/getting-cited-ai-poshuk/index.html': [TALK, TALK],
  'blog/jarvis-ai-assistant/index.html': [TALK],
  'blog/react-vs-tilda/index.html': [AI],
  'blog/seo-bez-reklamy-keis-atlas/index.html': [TALK, TALK],
  'blog/skilky-koshtuye-sajt/index.html': ['Оцінити проєкт безкоштовно →'],
  'blog/yak-obrati-rozrobnyka/index.html': [AI],
  'blog/yak-zamovyty-sajt/index.html': [AI],
  'pro-mene/index.html': [AI],
  'projects/ace/index.html': [TALK],
  'projects/agentis/index.html': [TALK],
  'projects/atlas/index.html': [CASE],
  'projects/juliaart/index.html': [CASE],
  'projects/ladomyr/index.html': ['Обговорити проєкт'],
  'projects/slavutych/index.html': [CASE],
  'services/ai/index.html': ['Спробуйте — він працює прямо зараз.', HELPER],
  'services/kyiv/index.html': [HELPER],
  'services/landing/index.html': [HELPER],
  'services/nextjs/index.html': [HELPER],
  'services/redesign/index.html': [HELPER],
};

/**
 * After step 3 (plan v3): the CTAs point at the /services/ form (19 in 17 files); the four that promised an AI
 * say «Обговорити проєкт →». The landing notes became hub links (HUB_LINKS); the services/ai «live AI demo»
 * callout now links a real AI case, so it is no longer a CTA.
 */
const CTA_AFTER = {
  'blog/chek-list-zamovlennya-sajtu/index.html': [TALK],
  'blog/devlog-business-empire-idle/index.html': [TALK],
  'blog/devlog-empire-online/index.html': [TALK],
  'blog/getting-cited-ai-poshuk/index.html': [TALK, TALK],
  'blog/jarvis-ai-assistant/index.html': [TALK],
  'blog/react-vs-tilda/index.html': [TALK],
  'blog/seo-bez-reklamy-keis-atlas/index.html': [TALK, TALK],
  'blog/skilky-koshtuye-sajt/index.html': ['Оцінити проєкт безкоштовно →'],
  'blog/yak-obrati-rozrobnyka/index.html': [TALK],
  'blog/yak-zamovyty-sajt/index.html': [TALK],
  'pro-mene/index.html': [TALK],
  'projects/ace/index.html': [TALK],
  'projects/agentis/index.html': [TALK],
  'projects/atlas/index.html': [CASE],
  'projects/juliaart/index.html': [CASE],
  'projects/ladomyr/index.html': ['Обговорити проєкт'],
  'projects/slavutych/index.html': [CASE],
};

/** Notes under the landing forms link the hub instead of sending people to another form (plan v3). */
const HUB_LINKS = Object.fromEntries(
  ['ai', 'kyiv', 'landing', 'nextjs', 'redesign'].map((slug) => [`services/${slug}/index.html`, ['сторінці послуг']])
);

/** R2 of Ф1: «напишіть мені» error-report links in Parkinson posts (3 in 2 files). */
const CONTACT_FILES = {
  'journal/parkinson-shcho-robyty/index.html': ['напишіть мені'],
  'journal/rannii-parkinsonizm/index.html': ['напишіть мені', 'напишіть мені'],
};


/**
 * Ф2: which hub each post belongs to. `primary` decides the breadcrumb (exactly one hub per post);
 * `also` are extra collections a hub shows without owning the post. The plan's table, as data.
 * Tests check the inventory independently of this manifest, so it cannot confirm itself.
 */
export const HUB_MEMBERS = {
  'parkinson/': {
    name: 'Паркінсон',
    primary: [
      'journal/diahnoz-u-27/index.html',
      'journal/rannii-parkinsonizm/index.html',
      'journal/parkinson-shcho-robyty/index.html',
      'journal/eksperyment-nad-soboyu/index.html',
      'journal/hoverla/index.html',
    ],
    also: [],
  },
  'creative/': {
    name: 'Творчість',
    primary: [
      'journal/holodylnyi-apokalipsys/index.html',
      'journal/kabachok-starosta/index.html',
      'journal/viddil-vtrachenoho-chasu/index.html',
      'journal/poverny-meni-chas/index.html',
    ],
    also: [],
  },
  'journal/': {
    name: 'Поза кодом',
    primary: [
      'journal/velozaizd/index.html',
      'journal/velyke-budivnytstvo/index.html',
      'journal/zhyly-buly/index.html',
      'journal/vira-i-religiya/index.html',
      'journal/vira-i-religiya-2/index.html',
      'journal/bytva-tserkov/index.html',
      'journal/pamyati-maksyma-babaka/index.html',
    ],
    // the feed of /journal/ keeps showing every journal post, hub or not
    also: [
      'journal/diahnoz-u-27/index.html',
      'journal/rannii-parkinsonizm/index.html',
      'journal/parkinson-shcho-robyty/index.html',
      'journal/eksperyment-nad-soboyu/index.html',
      'journal/hoverla/index.html',
      'journal/holodylnyi-apokalipsys/index.html',
      'journal/kabachok-starosta/index.html',
      'journal/viddil-vtrachenoho-chasu/index.html',
      'journal/poverny-meni-chas/index.html',
    ],
  },
  'code/': {
    name: 'Код',
    primary: [
      'blog/devlog-business-empire-idle/index.html',
      'blog/devlog-empire-online/index.html',
      'blog/jarvis-ai-assistant/index.html',
    ],
    also: [
      'blog/seo-bez-reklamy-keis-atlas/index.html',
      'blog/getting-cited-ai-poshuk/index.html',
      'blog/internal-linking/index.html',
    ],
  },
  'services/': {
    name: 'Послуги',
    primary: [
      'blog/chek-list-zamovlennya-sajtu/index.html',
      'blog/react-vs-tilda/index.html',
      'blog/skilky-koshtuye-sajt/index.html',
      'blog/tilda-vs-webflow-vs-kastom/index.html',
      'blog/yak-obrati-rozrobnyka/index.html',
      'blog/yak-zamovyty-sajt/index.html',
      'blog/seo-bez-reklamy-keis-atlas/index.html',
      'blog/getting-cited-ai-poshuk/index.html',
      'blog/internal-linking/index.html',
    ],
    also: [],
  },
  'blog/': {
    name: 'Блог',
    primary: [], // the archive owns nothing: it lists all twelve articles
    also: [
      'blog/chek-list-zamovlennya-sajtu/index.html',
      'blog/devlog-business-empire-idle/index.html',
      'blog/devlog-empire-online/index.html',
      'blog/getting-cited-ai-poshuk/index.html',
      'blog/internal-linking/index.html',
      'blog/jarvis-ai-assistant/index.html',
      'blog/react-vs-tilda/index.html',
      'blog/seo-bez-reklamy-keis-atlas/index.html',
      'blog/skilky-koshtuye-sajt/index.html',
      'blog/tilda-vs-webflow-vs-kastom/index.html',
      'blog/yak-obrati-rozrobnyka/index.html',
      'blog/yak-zamovyty-sajt/index.html',
    ],
  },
};

/** file → { hub, name, item } for the post's own breadcrumb, derived from HUB_MEMBERS. */
export const primaryHub = () => {
  const out = new Map();
  for (const [hub, { name, primary }] of Object.entries(HUB_MEMBERS)) {
    for (const file of primary) {
      if (out.has(file)) throw new Error(`${file} is primary in two hubs`);
      out.set(file, { hub, name, item: `${SITE}/${hub}` });
    }
  }
  return out;
};

/** Breadcrumb rules of a phase, one group per hub — no defaults, so an unlisted page is a coverage failure. */
function hubCrumbs() {
  const groups = new Map();
  for (const [file, { hub, name, item }] of primaryHub()) {
    const key = `${name}\u0000${item}`;
    if (!groups.has(key)) groups.set(key, { files: [], name, item });
    groups.get(key).files.push(file);
  }
  return [...groups.values()].map(({ files, name, item }) => ({
    pages: new RegExp(`^(${files.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`),
    name,
    item,
  }));
}

const SERVICE_PAGE = /^services\/[^/]+\/index\.html$/;
const PROJECT_PAGE = /^projects\/[^/]+\/index\.html$/;
const BLOG_CRUMB = { pages: /^blog\/[^/]+\/index\.html$/, name: 'Блог', item: `${SITE}/#blog` }; // Ф2 repoints it

/** Our entity @id never changes; until Ф3 moves the full node these pages keep exactly these occurrences. */
const ID_COUNTS = {
  [`${SITE}/#business`]: {
    'index.html': 1,
    'services/index.html': 6, // CollectionPage.about + provider of 5 services — references only
    'services/kyiv/index.html': 2,
    'services/redesign/index.html': 1,
  },
};

// links: per file, the <a> elements with exactly these texts (as a multiset), every one pointing at `href`.
export const PHASES = {
  // Before Ф1 step 3: the four inventoried homepage anchors are still in use.
  'f1-pre': {
    homeAnchors: ['chat-section', 'scenarios', 'portfolio', 'blog'],
    links: [
      { rule: 'cta-links', href: `${SITE}/#chat-section`, files: CTA_BEFORE },
      { rule: 'contact-links', href: `${SITE}/#chat-section`, files: CONTACT_FILES },
    ],
    breadcrumbs: [
      { pages: SERVICE_PAGE, name: 'Послуги', item: `${SITE}/#scenarios` },
      { pages: PROJECT_PAGE, name: 'Портфоліо', item: `${SITE}/#portfolio` },
      BLOG_CRUMB,
    ],
    idCounts: ID_COUNTS,
  },
  // After Ф1 step 3: CTAs and breadcrumbs point at /services/; only /#blog remains (Ф2).
  'f1-done': {
    homeAnchors: ['blog'],
    links: [
      { rule: 'cta-links', href: `${SITE}/services/#contact`, files: CTA_AFTER },
      { rule: 'hub-links', href: `${SITE}/services/`, files: HUB_LINKS },
      { rule: 'contact-links', href: PERSONAL_CONTACT, files: CONTACT_FILES },
    ],
    breadcrumbs: [
      { pages: SERVICE_PAGE, name: 'Послуги', item: `${SITE}/services/` },
      { pages: PROJECT_PAGE, name: 'Послуги', item: `${SITE}/services/` },
      BLOG_CRUMB,
    ],
    idCounts: ID_COUNTS,
  },
};

// Ф2 step 1: the same state as f1-done, renamed so the phase matches the plan we are executing.
PHASES['f2-pre'] = PHASES['f1-done'];

// Ф2 after the breadcrumb migration: no homepage anchor is left, and every post belongs to a hub.
PHASES['f2-done'] = {
  homeAnchors: [],
  links: PHASES['f1-done'].links,
  breadcrumbs: [
    { pages: SERVICE_PAGE, name: 'Послуги', item: `${SITE}/services/` },
    { pages: PROJECT_PAGE, name: 'Послуги', item: `${SITE}/services/` },
    ...hubCrumbs(),
  ],
  idCounts: ID_COUNTS,
};

export const CURRENT_PHASE = 'f2-done';

