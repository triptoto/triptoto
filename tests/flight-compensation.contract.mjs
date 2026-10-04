import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Flight compensation: Trip options → Support tile, internal /flight-compensation page,
// one Travelpayouts referral to Compensair opened outside the app.
const src = readFileSync('public/mobile-app.js', 'utf8');
const routes = readFileSync('public/mobile-routes.js', 'utf8');
const site = JSON.parse(readFileSync('seo/site.json', 'utf8'));
const robots = readFileSync('public/robots.txt', 'utf8');
const css = readFileSync('public/mobile-app.css', 'utf8');
const minJs = readFileSync('public/mobile-app.min.js', 'utf8');
const REFERRAL = 'https://tp.media/r?campaign_id=86&marker=465464&p=4129&trs=570553&u=https%3A%2F%2Fcompensair.com';

// 4. The exact referral URL, defined once and used through the constant only.
assert.equal(src.split(REFERRAL).length - 1, 1, 'referral URL must appear exactly once as a literal');
assert.ok(src.includes(`const COMPENSAIR_REFERRAL_URL = "${REFERRAL}";`), 'COMPENSAIR_REFERRAL_URL constant');
assert.ok(!/tp\.media\/r\?campaign_id=86/.test(src.replace(REFERRAL, '')), 'no second Compensair referral');
assert.ok(minJs.includes(REFERRAL), 'minified bundle carries the referral URL');

// 1. Tile in Support routes to the page.
const tripOptions = src.slice(src.indexOf('function tripOptionsScreen()'), src.indexOf('function tripOptionsScreen()') + 12000);
const support = tripOptions.slice(tripOptions.indexOf('"Support"') > 0 ? tripOptions.indexOf('"Support"') : tripOptions.indexOf('Support'));
assert.match(support, /optionRow\("shield", fcCopy\("title"\), fcCopy\("tileSub"\), `data-screen="flight-compensation"/, 'Support tile');
assert.ok(support.indexOf('data-screen="flight-compensation"') < support.indexOf('Help & FAQ'), 'tile sits before Help & FAQ');

// 2. Direct navigation / refresh: route, render case, worker app route, robots.
assert.match(routes, /"flight-compensation": "\/flight-compensation"/, 'static route');
assert.ok(site.appRoutes.includes('flight-compensation'), 'seo/site.json appRoutes');
assert.match(robots, /^Disallow: \/flight-compensation$/m, 'robots Disallow');
assert.ok(/case "flight-compensation": html = flightCompensationScreen\(\); break;/.test(src), 'render switch');

// 3. Back falls back to Trip options.
assert.ok(/"flight-compensation": "trip-options"/.test(src), 'BACK_FALLBACKS');
assert.ok(src.includes('const STRICT_BACK_SCREENS = new Set(["trip-options"]);'), 'Trip options keeps its strict back to the timeline');

// Render the screen in isolation for every locale and both network states.
const start = src.indexOf('  const FLIGHT_COMP_COPY = Object.freeze({');
const end = src.indexOf('  // ===== Free trip collaboration', start);
assert.ok(start > 0 && end > start, 'feature block found');
const block = src.slice(start, end);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const factory = Function('esc', 'icon', 'mobilePage', 'COMPENSAIR_REFERRAL_URL', 'navigator',
  `${block}; return { FLIGHT_COMP_COPY, fcCopy, flightCompensationScreen, flightCompensationOffline };`);
const make = (online) => factory(esc, (name) => `<svg data-icon="${name}"></svg>`, (title, body, back, actions, cls) => `<main class="${cls}" data-back="${back}"><h1 class="title">${esc(title)}</h1>${body}</main>`, REFERRAL, { onLine: online });
const { FLIGHT_COMP_COPY } = make(true);

// 8. Every locale has the same keys and keeps the brand and numbers.
const locales = ['en', 'de', 'fr', 'es', 'ru'];
assert.deepEqual(Object.keys(FLIGHT_COMP_COPY).sort(), [...locales].sort(), 'all supported locales');
const enKeys = Object.keys(FLIGHT_COMP_COPY.en).sort();
for (const l of locales) {
  const copy = FLIGHT_COMP_COPY[l];
  assert.deepEqual(Object.keys(copy).sort(), enKeys, `${l}: key set matches en`);
  for (const [k, v] of Object.entries(copy)) assert.ok(typeof v === 'string' && v.trim(), `${l}.${k} non-empty`);
  assert.match(copy.amountTitle, /600/, `${l}: €600`);
  assert.match(copy.amountTitle, /€/, `${l}: euro sign`);
  assert.match(copy.feeSuccess, /35\s?%/, `${l}: 35%`);
  assert.match(copy.feeLegal, /10\s?%/, `${l}: 10%`);
  for (const k of ['heroBody', 'disclosure', 'privacy', 'linkPayment']) assert.match(copy[k], /Compensair/, `${l}.${k} keeps Compensair`);
  assert.match(copy.externalLabel, /\{name\}/, `${l}: externalLabel interpolates`);
}
assert.equal(FLIGHT_COMP_COPY.en.title, 'Flight compensation');
assert.equal(FLIGHT_COMP_COPY.en.tileSub, 'Delayed or cancelled?');
assert.equal(FLIGHT_COMP_COPY.en.eyebrow, 'Passenger rights');
assert.equal(FLIGHT_COMP_COPY.en.heroTitle, 'Flight delayed or cancelled?');
assert.equal(FLIGHT_COMP_COPY.en.cta, 'Check my flight');

const structure = (html) => html.replace(/>[^<]*</g, '><').replace(/ aria-label="[^"]*"/g, '');
let enStructure = null;
for (const l of locales) {
  globalThis.TriptoI18n = { locale: l };
  const html = make(true).flightCompensationScreen();
  // 4/5. CTA href, new tab and rel semantics.
  const cta = html.match(/<a class="mobile-primary-action fc-cta"[^>]*>/)?.[0];
  assert.ok(cta, `${l}: CTA rendered`);
  assert.ok(cta.includes(`href="${esc(REFERRAL)}"`), `${l}: CTA uses the exact referral URL`);
  assert.ok(cta.includes('target="_blank"'), `${l}: CTA opens a new tab`);
  assert.ok(cta.includes('rel="sponsored noopener noreferrer"'), `${l}: CTA rel`);
  for (const a of html.match(/<a [^>]*>/g)) {
    assert.match(a, /target="_blank"/, `${l}: every link leaves the app`);
    assert.match(a, /rel="[^"]*noopener noreferrer"/, `${l}: every link noopener noreferrer`);
  }
  for (const url of ['https://www.compensair.com/en/payment-policy/', 'https://www.compensair.com/en/terms-and-conditions/', 'https://www.compensair.com/en/faq.html']) assert.ok(html.includes(`href="${url}"`), `${l}: ${url}`);
  // 7. Informational only: no form, iframe, inputs.
  assert.ok(!/<(form|iframe|input|textarea|select|embed|object)\b/i.test(html), `${l}: no form or iframe`);
  assert.ok(!html.includes('fc-offline'), `${l}: no offline note when online`);
  // 9 (structural part). Locales share one structure; themes only restyle it via CSS.
  if (!enStructure) enStructure = structure(html); else assert.equal(structure(html), enStructure, `${l}: same structure as en`);
  assert.equal((html.match(/<h1\b/g) || []).length, 2, `${l}: page title + hero h1 only`);
}
delete globalThis.TriptoI18n;

// 7. No storage, network or partner SDK inside the feature.
assert.ok(!/localStorage|sessionStorage|indexedDB|fetch\(|api\(|XMLHttpRequest|sendBeacon|gtag|<script/.test(block), 'no storage, requests or analytics in the feature');

// 12. Offline: inline note + the click is stopped with a toast.
const offlineHtml = make(false).flightCompensationScreen();
assert.match(offlineHtml, /<p class="fc-offline" role="status">/, 'offline note');
assert.match(offlineHtml, /class="mobile-primary-action fc-cta is-offline"/, 'offline CTA state');
assert.ok(/if \(target\.dataset\.action === "flight-compensation-referral"\) \{\s*if \(flightCompensationOffline\(\)\) \{\s*event\.preventDefault\(\);\s*showToast\(fcCopy\("offline"\), "alert"\);\s*\}\s*return;\s*\}/.test(src), 'offline click guard');

// 6. Android: an online CTA click is not prevented, so installNativeLinks hands the
// cross-origin URL to TriptoNative.openExternal (system browser).
const nativeFn = src.slice(src.indexOf('  function nativeExternalUrl(href) {'), src.indexOf('  async function openNativeExternal'));
const nativeExternalUrl = Function('location', 'API', 'NATIVE_WEB_ONLY_PATHS', `${nativeFn}; return nativeExternalUrl;`)({ href: 'https://localhost/flight-compensation', origin: 'https://localhost' }, 'https://tripto.to', new Set());
assert.equal(nativeExternalUrl(REFERRAL), REFERRAL, 'referral leaves the WebView unchanged');
assert.ok(/const external = nativeExternalUrl\(anchor\.href\);\s*if \(!external\) return;\s*event\.preventDefault\(\);\s*void openNativeExternal\(external\);/.test(src), 'native link path');
assert.ok(/if \(event\.defaultPrevented \|\| event\.button > 0\) return;/.test(src), 'native path respects the offline guard');

// 10/11. Layout guards: wrapping text, single-column cases on narrow phones, 44px targets.
const fcCss = css.slice(css.indexOf('.flight-comp-page'));
assert.ok(fcCss.length > 0, 'flight compensation CSS');
assert.match(fcCss, /@media\(max-width:359px\)\{[^}]*\.fc-cases\{grid-template-columns:minmax\(0,1fr\)\}/, 'one column under 360px');
assert.match(fcCss, /\.fc-cta\{[^}]*min-height:max\(48px/, 'CTA >= 48px');
assert.match(fcCss, /\.to-copy strong\{white-space:normal;overflow:visible/, 'long strings wrap');
assert.match(fcCss, /prefers-reduced-motion/, 'reduced motion');
assert.match(fcCss, /\.fc-cta:focus-visible/, 'focus style');

// Page help entry exists (every header has a "?").
assert.ok(/"flight-compensation": \{\s*title: "About Flight compensation"/.test(src), 'page help');

console.log('flight-compensation contract ok');
