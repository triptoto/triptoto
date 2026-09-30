import { readFileSync, writeFileSync } from 'node:fs';

const OUT = process.argv[2];
const raw = JSON.parse(readFileSync(OUT, 'utf8'));
const data = raw.result || raw;
const staticIn = data.static || [];
const dynamicIn = data.dynamic || [];

// --- Filter: drop things that must NOT be translated ---
const DROP_SUBSTR = ['OpenFreeMap', 'OpenStreetMap', 'OpenMapTiles'];
function isTranslatable(en) {
  const s = String(en || '').trim();
  if (!s) return false;
  if (s.length < 2) return false;                          // single char
  if (/^[\p{P}\p{S}\s\d.,:/+%°-]+$/u.test(s)) return false; // only symbols/digits (e.g. "9+", "$39")
  if (/^\$?\d[\d.,]*$/.test(s)) return false;               // prices/numbers
  if (/^https?:\/\//i.test(s) || /^[\w.+-]+@[\w.-]+$/.test(s)) return false; // url/email
  if (DROP_SUBSTR.some((d) => s.includes(d))) return false; // attribution
  return true;
}

// --- Key generation: <namespace>.<slug>, unique ---
const NS_RULES = [
  [/nav|tab bar|bottom nav|menu/i, 'nav'],
  [/seo|meta|og:|twitter/i, 'seo'],
  [/faq|question|answer/i, 'faq'],
  [/hero|benefit|landing|marketing|eyebrow|tagline|pricing|plan price/i, 'marketing'],
  [/validation|must be|is required|invalid|too long/i, 'validation'],
  [/error|unavailable|not found|failed|conflict|denied|forbidden/i, 'error'],
  [/notif/i, 'notification'],
  [/toast|saved|removed|deleted|updated|added\b/i, 'toast'],
  [/weather|forecast/i, 'weather'],
  [/currency/i, 'currency'],
  [/map\b/i, 'map'],
  [/checklist|task/i, 'checklist'],
  [/day plan|dayplan|itinerary/i, 'dayplan'],
  [/flight|train|bus|cruise|transport|car rental/i, 'transport'],
  [/booking|reservation|import/i, 'booking'],
  [/document|attachment|file/i, 'document'],
  [/account|profile|sign|auth|subscription|billing/i, 'account'],
  [/button|cta|submit/i, 'action'],
  [/placeholder/i, 'form'],
  [/aria|sr-only|screen reader/i, 'a11y'],
  [/sample|demo/i, 'sample'],
  [/empty/i, 'empty'],
];
function ns(note) {
  for (const [re, name] of NS_RULES) if (re.test(note || '')) return name;
  return 'ui';
}
function slug(en) {
  return String(en)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&amp;/g, 'and').replace(/&[a-z]+;/g, ' ')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .split('_').slice(0, 7).join('_').slice(0, 48).replace(/_+$/, '') || 'text';
}
const used = new Set();
function keyFor(en, note) {
  let base = `${ns(note)}.${slug(en)}`;
  let key = base, i = 2;
  while (used.has(key)) key = `${base}_${i++}`;
  used.add(key);
  return key;
}

// Decode HTML entities so source-map matches rendered text-node content.
function decode(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·')
    .replace(/&nbsp;/g, ' ').replace(/&hellip;/g, '…');
}

const sourceMap = {};   // english -> key   (static only; DOM-swap matches exact text)
const enMessages = {};  // key -> english
const inventory = [];   // {key, en} for translation
const dynamicList = []; // dynamic {key, en} for surgical wiring

for (const it of staticIn) {
  const en = decode(it.en);
  if (!isTranslatable(en)) continue;
  if (sourceMap[en]) continue; // already keyed (dupe after decode)
  const key = keyFor(en, it.note);
  sourceMap[en] = key;
  enMessages[key] = en;
  inventory.push({ key, en });
}
for (const it of dynamicIn) {
  const en = decode(it.en);
  if (!isTranslatable(en)) continue;
  const key = keyFor(en, (it.note || '') + ' dynamic');
  enMessages[key] = en;
  inventory.push({ key, en });
  dynamicList.push({ key, en, note: it.note || '' });
}

writeFileSync('/tmp/i18n-source-map.json', JSON.stringify(sourceMap, null, 0));
writeFileSync('/tmp/i18n-en-messages.json', JSON.stringify(enMessages, null, 0));
writeFileSync('/tmp/i18n-inventory.json', JSON.stringify(inventory));
writeFileSync('/tmp/i18n-dynamic.json', JSON.stringify(dynamicList, null, 2));

console.log('static in:', staticIn.length, 'dynamic in:', dynamicIn.length);
console.log('translatable static (source-map):', Object.keys(sourceMap).length);
console.log('dynamic (for wiring):', dynamicList.length);
console.log('total inventory to translate:', inventory.length);
console.log('namespaces:', [...new Set(inventory.map((i) => i.key.split('.')[0]))].sort().join(', '));