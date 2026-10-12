// scripts/csp-check.mjs promises that a run leaves no trace: no analytics hit, no lead, no YouTube view. That
// promise lives in stubKind(); this pins it, along with the console patterns that mean a header is broken.
import { describe, it, expect } from 'vitest';
import { stubKind, BROKEN_HEADER } from '../scripts/csp-check.mjs';

const BASE = 'https://www.parkinsandr.tech';

describe('csp-check: what never reaches the network', () => {
  it.each([
    ['https://analytics.google.com/g/collect?v=2&tid=G-X', 'GA4 collect on the bare domain'],
    ['https://region1.google-analytics.com/g/collect?v=2', 'GA4 regional collect'],
    ['https://stats.g.doubleclick.net/g/collect?v=2', 'Google Signals'],
    ['https://pagead2.googlesyndication.com/measurement/conversion?en=generate_lead', 'an Ads conversion of a lead'],
    ['https://www.google.com/ccm/collect?en=page_view', 'the tag conversion ping'],
    ['https://www.google.com.ua/ads/ga-audiences?v=1', 'Signals audiences, Ukraine'],
    ['https://www.google.de/ads/ga-audiences?v=1', 'Signals audiences, any other country'],
    ['https://www.google.co.uk/ads/ga-audiences?v=1', 'a two-part country domain'],
    ['https://c.bing.com/c.gif?ctsa=1', 'Clarity cookie sync'],
    ['https://j.clarity.ms/collect', 'Clarity upload'],
    ['https://c.clarity.ms/c.gif?ctsa=mr', 'Clarity cookie sync on its own subdomain'],
    ['https://oleksandr-site.sashko1391.workers.dev/', 'the lead Worker'],
    [`${BASE}/api/event/`, 'Plausible through the proxy'],
    [`${BASE}/api/lead/`, 'a lead through our own API'],
  ])('%s is a beacon (%s)', (url) => {
    expect(stubKind(url, BASE)).toBe('beacon');
  });

  it('the YouTube player behind the facade is answered locally too', () => {
    expect(stubKind('https://www.youtube-nocookie.com/embed/xfXhs1Xy_yk?autoplay=1', BASE)).toBe('player');
  });

  it.each([
    'https://www.googletagmanager.com/gtag/js?id=G-Y891WWYE79',
    'https://www.clarity.ms/tag/w7i1iwx0ah',
    'https://scripts.clarity.ms/0.8.1/clarity.js',
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    `${BASE}/js/script.js`,
    `${BASE}/api/comments/?slug=blog%2Fx`,
  ])('%s loads for real — it is what the policy has to allow', (url) => {
    expect(stubKind(url, BASE)).toBeNull();
  });
});

describe('csp-check: console lines that mean a broken header', () => {
  it.each([
    "Error with Permissions-Policy header: Unrecognized feature: 'interest-cohort'.",
    "The Content Security Policy directive 'frame-ancestors' is ignored when delivered in a report-only policy.",
    "Unrecognized Content-Security-Policy directive 'fram-src'.",
    "The Content-Security-Policy directive 'script-src' contains an invalid source: 'https://'.",
  ])('catches: %s', (line) => {
    expect(BROKEN_HEADER.test(line)).toBe(true);
  });

  it('ignores ordinary page noise', () => {
    expect(BROKEN_HEADER.test('Failed to load resource: the server responded with a status of 404')).toBe(false);
  });
});
