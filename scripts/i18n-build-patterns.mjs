import { readFileSync, writeFileSync } from 'node:fs';

// Dynamic UI strings carry {placeholders}, so the exact-match source-map cannot catch them.
// patterns.json lets i18n.js template-translate them at runtime:
//   - countNouns: simple "{count} <noun>" strings route to the plural() engine (correct CLDR forms).
//   - patterns:   every other interpolated template -> its translated form, filled from captured vars.
// Each pattern has a scope that bounds where it may match, so a greedy capture never corrupts prose:
//   scope "all"  -> text nodes AND attributes (numeric-only, or a long distinctive literal).
//   scope "attr" -> attributes only (aria-label/title/placeholder/alt), where {title}/{name} are user data.
// Exact-match (source-map) always runs first, so patterns only see text the static map didn't cover.

const enMessages = JSON.parse(readFileSync('/tmp/i18n-en-messages.json', 'utf8'));
const dynamic = JSON.parse(readFileSync('/tmp/i18n-dynamic.json', 'utf8')); // [{key, en, note}]
const enBundle = JSON.parse(readFileSync('public/lang/en.json', 'utf8')); // for canonical plural noun forms

// English plural "other" forms -> plural key (mirrors PLURALS in i18n-build-bundles.mjs).
const COUNT_NOUNS = {
  trips: 'trip', travelers: 'traveler', documents: 'document', tasks: 'task', days: 'day',
  places: 'place', bookings: 'booking', changes: 'change', nights: 'night', stops: 'stop',
  notes: 'note', items: 'item', photos: 'photo', answers: 'answer',
};

// Placeholders that are always numeric/short-token -> constrained capture; keeps user prose from matching.
// NOTE: {from}/{to} are NOT here — they capture location/city names (user data), not numbers, so the
// route template "{from} to {to}" must stay attr-scoped (it's an aria-label). Marking them numeric made it
// "all"-scoped, and its generic interior literal " to " then hijacked visible headings like "Add to <trip>".
const NUMERIC = new Set(['count','n','total','day','days','num','stops','minutes','hours','done','completed','current','max','size','rate','plural','placed','ready','visited','age','expires','startDate','endDate']);

const countNouns = {};
const patterns = [];
const seen = new Set();

// Synthesize every "{count} <noun>" English form (singular + plural) from the canonical en plural table,
// so both "1 place" and "5 places" route to the locale-correct plural() engine regardless of extraction.
for (const [noun, forms] of Object.entries(enBundle.plural || {})) {
  for (const form of [forms.one, forms.other]) { if (form) countNouns[form] = noun; }
}

for (const it of dynamic) {
  const key = it.key;
  const en = enMessages[key];
  if (!en || !/\{[^}]+\}/.test(en)) continue; // only interpolated templates
  if (seen.has(en)) continue; seen.add(en);

  // Simple "{count} <noun>" -> plural engine (correct grammatical number per locale).
  // Register both the plural ("{count} places") and singular ("{count} place") English forms.
  const m = en.match(/^\{count\}\s+([A-Za-z]+)$/);
  if (m) {
    const w = m[1].toLowerCase();
    if (COUNT_NOUNS[w]) { countNouns[en] = COUNT_NOUNS[w]; continue; }
    const asPlural = Object.keys(COUNT_NOUNS).find((pl) => pl === w + 's' || pl === w + 'es'); // singular seen -> map to its plural key
    if (asPlural) { countNouns[en] = COUNT_NOUNS[asPlural]; continue; }
  }

  const names = [...en.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
  if (new Set(names).size !== names.length) continue; // duplicate placeholder -> can't build named groups
  const literal = en.replace(/\{[^}]+\}/g, '').trim();
  const literalAlpha = literal.replace(/[^A-Za-zÀ-ɏ]/g, '');
  if (literalAlpha.length < 2) continue; // no translatable words at all (pure format template)
  const allNumeric = names.every((n) => NUMERIC.has(n));

  // Keys whose template is a visible heading/label (not just an attribute) and is safely anchored by a
  // distinctive leading literal, so it must translate on text nodes too. "Add to {trip}" renders as the
  // empty-trip <h1>; without this it stayed attr-only and the greedy "{from} to {to}" a11y pattern hijacked
  // it ("Add to Shawinigan" -> "с Add по Shawinigan"). Keep this list tight — each entry is a text node.
  const FORCE_ALL = new Set(['empty.add_to_trip', 'ui.add_to_name']);

  // Scope: numeric-only, a long distinctive literal, or an explicitly-listed visible label is safe on text;
  // else attributes only (where {title}/{name}/{from}/{to} are user data that must not corrupt prose).
  const scope = (allNumeric || (literalAlpha.length >= 10 && /\s/.test(literal)) || FORCE_ALL.has(key)) ? 'all' : 'attr';
  patterns.push({ en, key, scope });
}

// Longest literal first so specific templates win over generic ones.
patterns.sort((a, b) => b.en.replace(/\{[^}]+\}/g, '').length - a.en.replace(/\{[^}]+\}/g, '').length);

const out = { numeric: [...NUMERIC], countNouns, patterns };
writeFileSync('public/lang/patterns.json', JSON.stringify(out, null, 2) + '\n');
const all = patterns.filter((p) => p.scope === 'all').length;
console.log('countNouns:', Object.keys(countNouns).length, '| patterns:', patterns.length, `(all=${all}, attr=${patterns.length - all})`);
