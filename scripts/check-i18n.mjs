import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const expected = ['en', 'de', 'fr', 'es', 'ru'];
const load = (l) => JSON.parse(readFileSync(`public/lang/${l}.json`, 'utf8'));
const bundles = Object.fromEntries(expected.map((l) => [l, load(l)]));
const en = bundles.en;
const enKeys = Object.keys(en.messages);
const enKeySet = new Set(enKeys);

// {plural} is an English-only pluralization-suffix marker ("s"/""); other languages express number
// differently (CLDR forms or invariant phrasing) and may legitimately omit it, so exclude it from parity.
const tokens = (s) => (String(s).match(/\{(\w+)\}/g) || []).filter((t) => t !== '{plural}').sort().join(',');
const CYRILLIC = /[Ѐ-ӿ]/;
const REQUIRED_PLURAL = { en: ['one', 'other'], de: ['one', 'other'], fr: ['one', 'other'], es: ['one', 'other'], ru: ['one', 'few', 'many', 'other'] };

// Coverage floor: guard against regressing to the old 86-string bundle.
assert(enKeys.length > 1500, `English bundle has only ${enKeys.length} keys; expected the full inventory (>1500).`);

for (const locale of expected) {
  const b = bundles[locale];
  assert.equal(b.locale, locale, `${locale}: locale id mismatch`);
  const keys = new Set(Object.keys(b.messages));
  // Every English key must be present (fallback guarantees this) and no extra keys.
  for (const k of enKeys) assert(keys.has(k), `${locale}: missing key ${k}`);
  for (const k of keys) assert(enKeySet.has(k), `${locale}: orphaned key ${k} not in English source`);
  for (const [k, v] of Object.entries(b.messages)) {
    assert.equal(typeof v, 'string', `${locale}.${k} must be a string`);
    assert(v.trim(), `${locale}.${k} is empty`);
    assert.equal(tokens(v), tokens(en.messages[k]), `${locale}.${k} interpolation placeholders differ from English`);
  }
  // No other language leaking into de/fr/es (catches the "Отель" bug).
  if (locale !== 'ru') {
    for (const [k, v] of Object.entries(b.messages)) assert(!CYRILLIC.test(v), `${locale}.${k} contains Cyrillic text: ${v}`);
  }
  // Plural categories present for every noun.
  for (const [noun, forms] of Object.entries(b.plural || {})) {
    for (const cat of REQUIRED_PLURAL[locale]) assert(forms[cat] && forms[cat].includes('{count}'), `${locale}.plural.${noun} missing "${cat}" form with {count}`);
  }
  // Plural noun set must match English.
  assert.deepEqual(Object.keys(b.plural).sort(), Object.keys(en.plural).sort(), `${locale}: plural noun set differs from English`);
}

// Source-map integrity: phrase -> key, keys must exist in English messages.
const source = JSON.parse(readFileSync('public/lang/source-map.json', 'utf8'));
const sourceEntries = Object.entries(source);
assert(sourceEntries.length > 1400, `source-map has only ${sourceEntries.length} entries; expected full static coverage.`);
for (const [phrase, key] of sourceEntries) {
  assert(enKeySet.has(key), `source-map phrase "${phrase}" -> unknown key ${key}`);
  assert.equal(en.messages[key], phrase, `source-map phrase "${phrase}" does not equal English message for ${key}`);
}

// Dynamic patterns integrity: keys resolve, count-nouns are real plural nouns, tokens are consistent.
const patterns = JSON.parse(readFileSync('public/lang/patterns.json', 'utf8'));
assert(Array.isArray(patterns.patterns) && patterns.patterns.length > 100, 'patterns.json missing dynamic templates.');
const enPluralNouns = new Set(Object.keys(en.plural));
for (const [phrase, noun] of Object.entries(patterns.countNouns)) {
  assert(enPluralNouns.has(noun), `patterns.countNouns "${phrase}" -> unknown plural noun ${noun}`);
  assert(phrase.includes('{count}'), `patterns.countNouns "${phrase}" must contain {count}`);
}
for (const p of patterns.patterns) {
  assert(enKeySet.has(p.key), `patterns.json template "${p.en}" -> unknown key ${p.key}`);
  assert(['all', 'attr'].includes(p.scope), `patterns.json template "${p.en}" has invalid scope ${p.scope}`);
  assert(/\{\w+\}/.test(p.en), `patterns.json template "${p.en}" has no placeholder`);
  // Placeholder names in the English template must be a subset of the localized message's tokens per locale.
  // {plural} (English suffix marker) is exempt — see tokens() above; translations may render number without it.
  const enToks = new Set((p.en.match(/\{(\w+)\}/g) || []).filter((tok) => tok !== '{plural}'));
  for (const locale of expected) {
    const msgToks = new Set(((bundles[locale].messages[p.key] || '').match(/\{(\w+)\}/g) || []));
    for (const tok of enToks) assert(msgToks.has(tok), `${locale}.${p.key} is missing ${tok} needed by its dynamic pattern`);
  }
}

// Integration wiring (unchanged contract).
const app = readFileSync('public/mobile-app.js', 'utf8');
const index = readFileSync('public/index.html', 'utf8');
const worker = readFileSync('apps/worker/src/index.ts', 'utf8');
assert(index.includes('/i18n.js') && index.indexOf('/i18n.js') < index.indexOf('/mobile-app.min.js'), 'I18n must load before the app shell.');
assert(app.includes('data-action="set-locale"') && app.includes('TriptoI18n.setLocale'), 'Account language selector is missing.');
assert(worker.includes('/api/v1/account/locale') && worker.includes('updateAccountLocale'), 'Account locale persistence route is missing.');
const runtime = readFileSync('public/i18n.js', 'utf8');
assert(runtime.includes('/lang/patterns.json'), 'i18n.js must load the dynamic patterns.');
const sw = readFileSync('public/sw.js', 'utf8');
assert(sw.includes('/lang/patterns.json'), 'Service worker must precache /lang/patterns.json.');

console.log(`i18n contract passed: ${enKeys.length} keys x ${expected.length} locales, ${sourceEntries.length} source-map phrases.`);