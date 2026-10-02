#!/usr/bin/env node
// Country Guide data pipeline. Reads pinned, licensed upstream sources,
// normalizes them into ONE record per ISO 3166-1 alpha-2 code, applies the
// reviewed overrides, validates, and writes the generated snapshot:
//
//   packages/country-guide/data/countries.generated.json   (never edit by hand)
//
// Sources (all pinned in data/sources.lock.json, integrity-checked):
//   CLDR 48 (cldr-core, cldr-bcp47)  codes, M49 regions, languages, currencies,
//                                     week data, measurement + unit preferences,
//                                     IANA time zone names
//   ICU/CLDR via Node Intl            names, local names, time zones per region,
//                                     date/time/number patterns of the likely locale
//   libphonenumber-js                 country calling codes
//   google-libphonenumber             emergency short numbers (ShortNumberMetadata)
//   @rapideditor/country-coder        driving side, road speed unit, ccTLD,
//                                     calling-code fallback
//   countries-list                    capital city (English)
//   data/sources/electricity.json     optional reviewed snapshot (see docs)
//   data/sources/emergency-services.json  optional reviewed snapshot (see docs)
//
// Nothing is guessed: a value the sources do not provide stays absent and the
// UI shows "Not available". Usage:
//   node --import tsx/esm scripts/update-country-guide.mjs            regenerate
//   node --import tsx/esm scripts/update-country-guide.mjs --check    regenerate in memory and fail if the committed file differs
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateDataset } from '../packages/country-guide/src/validate.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'packages/country-guide/data');
const CACHE = join(ROOT, '.cache/country-guide');
const OUT = join(DATA, 'countries.generated.json');
const CHECK = process.argv.includes('--check');
const require = createRequire(import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------------------------------------------------------------- sources
const lock = readJson(join(DATA, 'sources.lock.json'));
function sourceDir(pkg) {
  const dir = join(CACHE, `${pkg.name.replace(/[@/]/g, '_')}-${pkg.version}`);
  if (existsSync(join(dir, 'package/package.json'))) return join(dir, 'package');
  mkdirSync(dir, { recursive: true });
  const tgz = join(dir, 'pkg.tgz');
  execFileSync('curl', ['-sSfL', '-m', '120', '-o', tgz, pkg.tarball], { stdio: 'inherit' });
  const [algo, expected] = pkg.integrity.split('-');
  const actual = createHash(algo).update(readFileSync(tgz)).digest('base64');
  if (actual !== expected) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`Integrity mismatch for ${pkg.name}@${pkg.version}`);
  }
  execFileSync('tar', ['xzf', tgz, '-C', dir]);
  return join(dir, 'package');
}
const pkgDir = Object.fromEntries(lock.packages.map((p) => [p.name, sourceDir(p)]));
const pkgVersion = Object.fromEntries(lock.packages.map((p) => [p.name, p.version]));

const cldr = (name) => readJson(join(pkgDir['cldr-core'], 'supplemental', `${name}.json`)).supplemental;
const codeMappings = cldr('codeMappings').codeMappings;
const territoryContainment = cldr('territoryContainment').territoryContainment;
const territoryInfo = cldr('territoryInfo').territoryInfo;
const currencyRegions = cldr('currencyData').currencyData.region;
const weekFirstDay = cldr('weekData').weekData.firstDay;
const measurementSystem = cldr('measurementData').measurementData.measurementSystem;
const unitPrefs = cldr('unitPreferenceData').unitPreferenceData;
const tzKeywords = readJson(join(pkgDir['cldr-bcp47'], 'bcp47/timezone.json')).keyword.u.tz;
const phoneMeta = readJson(join(pkgDir['libphonenumber-js'], 'metadata.min.json'));
const capitals = readJson(join(pkgDir['countries-list'], 'countries.min.json'));
const shortNumbers = require(join(pkgDir['google-libphonenumber'], 'dist/libphonenumber.js')).ShortNumberInfo.getInstance();

// country-coder imports which-polygon for point lookups; the guide only reads
// per-code properties, so a no-op stub keeps the import self-contained.
const ccDir = pkgDir['@rapideditor/country-coder'];
const stub = join(ccDir, 'node_modules/which-polygon');
if (!existsSync(join(stub, 'index.js'))) {
  mkdirSync(stub, { recursive: true });
  writeFileSync(join(stub, 'package.json'), '{"name":"which-polygon","main":"index.js"}');
  writeFileSync(join(stub, 'index.js'), 'module.exports=function(){const q=()=>null;q.bbox=()=>[];return q;};');
}
const countryCoder = await import(pathToFileURL(join(ccDir, 'dist/country-coder.mjs')).href);
// Aggregate features (whole UK, US, China incl. territories) carry no driving
// side; their core wikidata features do.
const CC_CORE = { GB: 'Q3336843', US: 'Q35657', CN: 'Q19188' };

const ISO = readJson(join(DATA, 'iso3166-1.json')).codes;
const overrides = readJson(join(DATA, 'country-overrides.json')).overrides;
const optionalSnapshot = (file) => (existsSync(join(DATA, 'sources', file)) ? readJson(join(DATA, 'sources', file)) : null);
const electricitySnapshot = optionalSnapshot('electricity.json');
const emergencySnapshot = optionalSnapshot('emergency-services.json');

// ---------------------------------------------------------------- helpers
const englishRegion = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const ianaName = new Map();
for (const entry of Object.values(tzKeywords)) {
  if (!entry || !entry._alias) continue;
  const aliases = entry._alias.split(' ');
  const iana = entry._iana || aliases[0];
  for (const a of aliases) ianaName.set(a, iana);
}
const bcp47 = (code) => code.replace(/_/g, '-');
const uniq = (list) => [...new Set(list)];
const BIDI = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/g;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function likelyLocale(cc) {
  const max = new Intl.Locale(`und-${cc}`).maximize();
  return `${max.language}-${cc}`;
}

function datePattern(locale) {
  const fmt = new Intl.DateTimeFormat(`${locale}-u-nu-latn-ca-gregory`, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' });
  return fmt.formatToParts(new Date(Date.UTC(2026, 10, 23))).map((p) => {
    if (p.type === 'day') return 'DD';
    if (p.type === 'month') return 'MM';
    if (p.type === 'year') return 'YYYY';
    return p.value.replace(BIDI, '');
  }).join('').trim();
}

function timePattern(locale) {
  const fmt = new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  const h12 = /h1[12]/.test(fmt.resolvedOptions().hourCycle || '');
  return fmt.formatToParts(new Date(Date.UTC(2026, 10, 23, 15, 5))).map((p) => {
    if (p.type === 'hour') return h12 ? 'h' : 'HH';
    if (p.type === 'minute') return 'mm';
    if (p.type === 'dayPeriod') return 'a';
    return p.value.replace(BIDI, '').replace(/[  ]/g, ' ');
  }).join('').trim();
}

function numberSeparators(locale) {
  const parts = new Intl.NumberFormat(`${locale}-u-nu-latn`).formatToParts(1234567.5);
  return {
    decimalSeparator: parts.find((p) => p.type === 'decimal')?.value,
    groupingSeparator: parts.find((p) => p.type === 'group')?.value,
  };
}

// UN M49: the subregion is the non-grouping container of the code, the region
// is the continent-level container of that subregion.
const CONTINENTS = new Set(['002', '009', '019', '142', '150']);
const containerOf = (code) => Object.entries(territoryContainment).find(([key, v]) => /^\d{3}$/.test(key) && !v._grouping && v._contains?.includes(code))?.[0];
function m49(cc) {
  const sub = containerOf(cc);
  if (!sub) return {};
  let region = containerOf(sub);
  while (region && !CONTINENTS.has(region)) region = containerOf(region);
  return { region, subregion: sub };
}

function languages(cc) {
  const pop = territoryInfo[cc]?.languagePopulation || {};
  const entries = Object.entries(pop).filter(([code]) => code !== 'und').map(([code, v]) => ({ code: bcp47(code), status: v._officialStatus, pct: Number(v._populationPercent) || 0 }))
    .sort((a, b) => b.pct - a.pct || a.code.localeCompare(b.code));
  const official = entries.filter((e) => e.status === 'official' || e.status === 'de_facto_official').map((e) => e.code);
  const widely = entries.filter((e) => !official.includes(e.code) && e.pct >= 20).map((e) => e.code);
  return { official: uniq(official), widely: uniq(widely) };
}

function currencies(cc) {
  return (currencyRegions[cc] || []).flatMap((entry) => Object.entries(entry))
    .filter(([code, v]) => !v._to && v._tender !== 'false' && code !== 'XXX')
    .map(([code]) => code);
}

function unitFor(category, usage, cc) {
  const table = unitPrefs[category]?.[usage];
  if (!table) return undefined;
  return (table[cc] || table['001'])?.map((p) => p.unit);
}

function emergencyNumbers(cc) {
  if (!shortNumbers.getSupportedRegions().includes(cc)) return [];
  const found = [];
  for (let len = 2; len <= 5; len++) {
    for (let i = 0; i < 10 ** len; i++) {
      const digits = String(i).padStart(len, '0');
      if (shortNumbers.isEmergencyNumber(digits, cc)) found.push(digits);
    }
  }
  // isEmergencyNumber also accepts longer strings that start with a shorter
  // emergency number; keep only the shortest dialable form.
  return found.filter((d) => !found.some((p) => p !== d && d.startsWith(p)));
}

function callingCodes(cc) {
  const lib = phoneMeta.countries[cc]?.[0];
  if (lib) return { codes: [String(lib)], source: null };
  const coder = (countryCoder.callingCodes(cc) || []).map((c) => c.split(' ')[0]);
  return coder.length ? { codes: uniq(coder), source: 'country-coder' } : { codes: [], source: null };
}

// ---------------------------------------------------------------- build
const SOURCE_INFO = [
  { id: 'cldr', name: 'Unicode CLDR', version: pkgVersion['cldr-core'], license: 'Unicode-3.0', url: 'https://cldr.unicode.org/' },
  { id: 'icu-intl', name: `ICU ${process.versions.icu} / CLDR ${process.versions.cldr} / tz ${process.versions.tz} (Intl)`, license: 'Unicode-3.0', url: 'https://icu.unicode.org/' },
  { id: 'libphonenumber-js', name: 'libphonenumber-js metadata', version: pkgVersion['libphonenumber-js'], license: 'MIT', url: 'https://gitlab.com/catamphetamine/libphonenumber-js' },
  { id: 'libphonenumber-shortnumbers', name: 'Google libphonenumber ShortNumberMetadata', version: pkgVersion['google-libphonenumber'], license: 'Apache-2.0', url: 'https://github.com/google/libphonenumber' },
  { id: 'country-coder', name: 'country-coder (RapiD / OpenStreetMap)', version: pkgVersion['@rapideditor/country-coder'], license: 'ISC', url: 'https://github.com/rapideditor/country-coder' },
  { id: 'countries-list', name: 'countries-list', version: pkgVersion['countries-list'], license: 'MIT', url: 'https://github.com/annexare/Countries' },
];
if (electricitySnapshot) SOURCE_INFO.push(electricitySnapshot.source);
if (emergencySnapshot) SOURCE_INFO.push(emergencySnapshot.source);

const GROUP_PROVENANCE = {
  identity: { status: 'stable_source', changeFrequency: 'stable', sources: ['cldr', 'icu-intl', 'country-coder', 'countries-list'] },
  language: { status: 'stable_source', changeFrequency: 'stable', sources: ['cldr'] },
  currency: { status: 'stable_source', changeFrequency: 'moderate', sources: ['cldr'] },
  telecom: { status: 'stable_source', changeFrequency: 'stable', sources: ['libphonenumber-js', 'country-coder'] },
  time: { status: 'stable_source', changeFrequency: 'moderate', sources: ['icu-intl', 'cldr'] },
  formats: { status: 'stable_source', changeFrequency: 'stable', sources: ['icu-intl', 'cldr'] },
  measurements: { status: 'stable_source', changeFrequency: 'stable', sources: ['cldr', 'country-coder'] },
  electricity: electricitySnapshot
    ? { status: electricitySnapshot.status || 'needs_review', changeFrequency: 'stable', sources: [electricitySnapshot.source.id] }
    : { status: 'unavailable', changeFrequency: 'stable', sources: [] },
  driving: { status: 'stable_source', changeFrequency: 'stable', sources: ['country-coder'] },
  emergency: { status: 'needs_review', changeFrequency: 'changeable', sources: ['libphonenumber-shortnumbers', ...(emergencySnapshot ? [emergencySnapshot.source.id] : [])] },
  practical: { status: 'unavailable', changeFrequency: 'changeable', sources: [] },
};

const countries = {};
for (const cc of ISO) {
  const map = codeMappings[cc] || {};
  const feature = countryCoder.feature(cc);
  const coreCode = CC_CORE[cc] || cc;
  const lang = languages(cc);
  const name = englishRegion.of(cc);
  const localNames = uniq(lang.official).map((code) => {
    try {
      const dn = new Intl.DisplayNames([code], { type: 'region', fallback: 'none' });
      if (!dn.resolvedOptions().locale.startsWith(code.split('-')[0])) return null;
      const local = dn.of(cc);
      return local && local !== name ? { lang: code, name: local } : null;
    } catch { return null; }
  }).filter(Boolean).filter((e, i, list) => list.findIndex((x) => x.name === e.name) === i);

  const meta = {};
  const record = {
    identity: {
      iso3: map._alpha3,
      numericCode: map._numeric,
      name,
      ...(localNames.length ? { localNames } : {}),
      ...(capitals[cc]?.capital ? { capital: capitals[cc].capital } : {}),
      ...m49(cc),
      ...(feature?.properties?.ccTLD ? { internetTld: feature.properties.ccTLD } : {}),
    },
  };
  if (lang.official.length || lang.widely.length) {
    record.language = { ...(lang.official.length ? { officialLanguages: lang.official } : {}), ...(lang.widely.length ? { widelyUsedLanguages: lang.widely } : {}) };
  }
  const money = currencies(cc);
  if (money.length) record.currency = { currencies: money };
  const tel = callingCodes(cc);
  if (tel.codes.length) {
    record.telecom = { callingCodes: tel.codes };
    if (tel.source) meta.telecom = { source: tel.source, reason: 'Not in libphonenumber metadata; country-coder fallback.' };
  }
  const zones = uniq((new Intl.Locale(`und-${cc}`).getTimeZones?.() || []).map((z) => ianaName.get(z) || z)).sort();
  if (zones.length) record.time = { timeZones: zones };

  // Formats come from the territory's likely locale. Uninhabited territories
  // (no CLDR population for that language) would only get a generic fallback,
  // so they get no formats instead of misleading ones.
  const locale = likelyLocale(cc);
  const firstDay = weekFirstDay[cc] || weekFirstDay['001'];
  const max = new Intl.Locale(`und-${cc}`).maximize();
  const spoken = territoryInfo[cc]?.languagePopulation || {};
  if (spoken[max.language] || spoken[`${max.language}_${max.script}`]) {
    record.formats = {
      locale,
      dateFormat: datePattern(locale),
      timeFormat: timePattern(locale),
      firstDayOfWeek: WEEKDAYS.includes(firstDay) ? firstDay : 'mon',
      ...numberSeparators(locale),
    };
  }

  const system = measurementSystem[cc] || measurementSystem['001'];
  const temp = unitFor('temperature', 'weather', cc);
  const mass = unitFor('mass', 'default', cc);
  const speed = countryCoder.roadSpeedUnit(coreCode);
  record.measurements = {
    measurementSystem: system === 'metric' ? 'metric' : system,
    distanceUnit: unitFor('length', 'road', cc)?.[0] === 'mile' ? 'mile' : 'kilometer',
    ...(speed ? { roadSpeedUnit: speed } : {}),
    ...(temp?.[0] ? { temperatureUnit: temp[0] } : {}),
    // First of kilogram/pound in the CLDR preference list (the list starts with tonne/ton).
    ...(mass?.find((u) => u === 'kilogram' || u === 'pound') ? { weightUnit: mass.find((u) => u === 'kilogram' || u === 'pound') } : {}),
  };

  if (electricitySnapshot?.countries?.[cc]) record.electricity = electricitySnapshot.countries[cc];

  const side = countryCoder.driveSide(coreCode);
  if (side) record.driving = { drivingSide: side };

  const typed = emergencySnapshot?.countries?.[cc] || null;
  const numbers = emergencyNumbers(cc);
  if (numbers.length || typed) record.emergency = { ...(numbers.length ? { numbers } : {}), ...(typed || {}) };

  if (Object.keys(meta).length) record._meta = meta;
  countries[cc] = record;
}

// ---------------------------------------------------------------- overrides
for (const o of overrides) {
  const [group, field] = o.field.split('.');
  const record = countries[o.iso2];
  if (!record) throw new Error(`Override for unknown country ${o.iso2}`);
  record[group] = record[group] || {};
  if (o.value === null) delete record[group][field];
  else record[group][field] = o.value;
  if (!Object.keys(record[group]).length) delete record[group];
  record._meta = record._meta || {};
  record._meta[group] = { ...(record._meta[group] || {}), status: o.status || 'verified', source: o.source, verifiedAt: o.verifiedAt, reason: o.reason };
}

const previous = existsSync(OUT) ? readJson(OUT) : null;
const dataset = {
  datasetVersion: '',
  generatedAt: '',
  lastReviewedAt: lock.lastReviewedAt,
  expectedCount: ISO.length,
  sources: SOURCE_INFO,
  groups: GROUP_PROVENANCE,
  countries,
};
// Only a content change bumps the version and timestamp, so re-running the
// pipeline on unchanged sources is a no-op diff.
const contentHash = createHash('sha256').update(JSON.stringify({ ...dataset, datasetVersion: '', generatedAt: '' })).digest('hex').slice(0, 12);
const unchanged = previous && previous.datasetVersion?.endsWith(contentHash);
dataset.generatedAt = unchanged ? previous.generatedAt : new Date().toISOString();
dataset.datasetVersion = unchanged ? previous.datasetVersion : `${dataset.generatedAt.slice(0, 10)}.${contentHash}`;

const text = `${JSON.stringify(dataset, null, 1)}\n`;
const problems = validateDataset(dataset, text);
if (problems.length) {
  console.error(`Country Guide validation failed (${problems.length}):\n  ${problems.slice(0, 40).join('\n  ')}`);
  process.exit(1);
}
if (CHECK) {
  if (!unchanged) {
    console.error('countries.generated.json is out of date: run node scripts/update-country-guide.mjs');
    process.exit(1);
  }
  console.log(`Country Guide snapshot is current (${ISO.length} countries, ${dataset.datasetVersion}).`);
} else {
  writeFileSync(OUT, text);
  console.log(`Wrote ${OUT.replace(`${ROOT}/`, '')}: ${ISO.length} countries, ${dataset.datasetVersion}${unchanged ? ' (unchanged)' : ''}.`);
}
