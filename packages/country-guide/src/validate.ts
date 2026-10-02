import {
  CANONICAL_CONCEPTS,
  DERIVED_FIELDS,
  FIELD_OWNERSHIP,
  GROUPS,
  PLUG_TYPES,
  type CountryDataset,
  type GroupName,
} from './schema.ts';

// Structural validation shared by the generator (fails the build) and the
// contract test. Returns human-readable problems; an empty list means valid.

const STATUSES = new Set(['verified', 'stable_source', 'needs_review', 'unavailable']);
const WEEKDAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const ALIAS_OWNER = new Map<string, { owner: GroupName; field: string }>();
for (const concept of Object.values(CANONICAL_CONCEPTS)) {
  for (const alias of concept.aliases) ALIAS_OWNER.set(alias, { owner: concept.owner, field: concept.field });
}

// JSON.parse silently keeps the last of two equal keys, so duplicate keys must
// be found on the raw text.
export function duplicateJsonKeys(text: string): string[] {
  const found: string[] = [];
  const stack: { array: boolean; keys: Set<string>; path: string; last: string }[] = [];
  let expectKey = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const top = stack[stack.length - 1];
    if (ch === '"') {
      let value = '';
      for (i++; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === '\\') value += text[i++];
        value += text[i];
      }
      if (expectKey && top && !top.array) {
        if (top.keys.has(value)) found.push(`${top.path}.${value}`);
        top.keys.add(value);
        top.last = value;
        expectKey = false;
      }
    } else if (ch === '{' || ch === '[') {
      const path = top ? (top.array ? `${top.path}[]` : `${top.path}.${top.last}`) : '$';
      stack.push({ array: ch === '[', keys: new Set(), path, last: '' });
      expectKey = ch === '{';
    } else if (ch === '}' || ch === ']') {
      stack.pop();
    } else if (ch === ',') {
      expectKey = Boolean(top && !top.array);
    }
  }
  return found;
}

function collectKeys(value: unknown, path: string, out: { key: string; path: string }[]) {
  if (Array.isArray(value)) value.forEach((v, idx) => collectKeys(v, `${path}[${idx}]`, out));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      out.push({ key, path: `${path}.${key}` });
      collectKeys(v, `${path}.${key}`, out);
    }
  }
}

const isTimeZone = (zone: string) => {
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); return true; } catch { return false; }
};
const uniqueList = (list: unknown[]) => new Set(list).size === list.length;

export function validateDataset(data: CountryDataset, rawText?: string): string[] {
  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);
  if (rawText) for (const dup of duplicateJsonKeys(rawText)) fail(`duplicate JSON key ${dup}`);

  if (!data.datasetVersion || !data.generatedAt || !data.lastReviewedAt) fail('dataset version / generatedAt / lastReviewedAt missing');
  const codes = Object.keys(data.countries || {});
  if (codes.length !== data.expectedCount) fail(`expected ${data.expectedCount} countries, found ${codes.length}`);
  const sourceIds = new Set((data.sources || []).map((s) => s.id));
  if (sourceIds.size !== (data.sources || []).length) fail('duplicate source id');
  for (const s of data.sources || []) if (!s.license || !s.url || !s.name) fail(`source ${s.id} lacks name/license/url`);
  for (const group of GROUPS) {
    const g = data.groups?.[group];
    if (!g) { fail(`group provenance missing for ${group}`); continue; }
    if (!STATUSES.has(g.status)) fail(`group ${group} has invalid status ${g.status}`);
    for (const id of g.sources) if (!sourceIds.has(id)) fail(`group ${group} cites unknown source ${id}`);
    if (g.status !== 'unavailable' && !g.sources.length) fail(`group ${group} has data status without a source`);
  }

  const seenIso3 = new Map<string, string>();
  const seenNumeric = new Map<string, string>();
  for (const cc of codes) {
    const r = data.countries[cc] as Record<string, any>;
    if (!/^[A-Z]{2}$/.test(cc)) fail(`${cc}: key is not ISO alpha-2`);
    for (const group of Object.keys(r)) {
      if (group === '_meta') continue;
      if (!(GROUPS as readonly string[]).includes(group)) { fail(`${cc}: unknown group ${group}`); continue; }
      if (!r[group] || typeof r[group] !== 'object' || !Object.keys(r[group]).length) fail(`${cc}.${group}: empty group must be omitted`);
      if (data.groups[group as GroupName]?.status === 'unavailable' && !r._meta?.[group]) fail(`${cc}.${group}: data in an unavailable group without per-country provenance`);
      for (const field of Object.keys(r[group] || {})) {
        if (!FIELD_OWNERSHIP[group as GroupName].includes(field)) fail(`${cc}.${group}.${field}: field not owned by ${group}`);
      }
    }
    // Every key anywhere in the record: no derived values, no concept outside its owner.
    const keys: { key: string; path: string }[] = [];
    collectKeys(r, cc, keys);
    for (const { key, path } of keys) {
      if ((DERIVED_FIELDS as readonly string[]).includes(key)) fail(`${path}: derived value must not be stored`);
      const owner = ALIAS_OWNER.get(key);
      const isGroupKey = path === `${cc}.${key}` && (GROUPS as readonly string[]).includes(key);
      if (owner && !isGroupKey && path !== `${cc}.${owner.owner}.${owner.field}`) fail(`${path}: ${owner.owner}.${owner.field} stored in a second place`);
    }

    const id = r.identity;
    if (!id?.name) fail(`${cc}: identity.name missing`);
    if (id?.iso3 !== undefined) {
      if (!/^[A-Z]{3}$/.test(id.iso3)) fail(`${cc}: bad iso3 ${id.iso3}`);
      if (seenIso3.has(id.iso3)) fail(`${cc}: iso3 ${id.iso3} also used by ${seenIso3.get(id.iso3)}`);
      seenIso3.set(id.iso3, cc);
    }
    if (id?.numericCode !== undefined) {
      if (!/^\d{3}$/.test(id.numericCode)) fail(`${cc}: bad numeric code ${id.numericCode}`);
      if (seenNumeric.has(id.numericCode)) fail(`${cc}: numeric ${id.numericCode} also used by ${seenNumeric.get(id.numericCode)}`);
      seenNumeric.set(id.numericCode, cc);
    }
    if (id?.internetTld !== undefined && !/^\.[a-z]{2}$/.test(id.internetTld)) fail(`${cc}: bad TLD ${id.internetTld}`);
    for (const k of ['region', 'subregion'] as const) if (id?.[k] !== undefined && !/^\d{3}$/.test(id[k])) fail(`${cc}: bad ${k}`);
    if (id?.localNames && !uniqueList(id.localNames.map((n: any) => n.name))) fail(`${cc}: duplicate local name`);

    if (r.language) {
      const all = [...(r.language.officialLanguages || []), ...(r.language.widelyUsedLanguages || [])];
      if (!uniqueList(all)) fail(`${cc}: a language is listed twice`);
      for (const l of all) if (!/^[a-z]{2,3}(-[A-Z][a-z]{3})?(-[A-Z]{2}|-\d{3})?$/.test(l)) fail(`${cc}: bad language tag ${l}`);
    }
    if (r.currency) {
      const list = r.currency.currencies;
      if (!list?.length || !uniqueList(list) || list.some((c: string) => !/^[A-Z]{3}$/.test(c))) fail(`${cc}: bad currencies ${list}`);
    }
    if (r.telecom) {
      const list = r.telecom.callingCodes;
      if (!list?.length || !uniqueList(list) || list.some((c: string) => !/^[1-9]\d{0,2}$/.test(c))) fail(`${cc}: bad calling codes ${list}`);
    }
    if (r.time) {
      const list = r.time.timeZones;
      if (!list?.length || !uniqueList(list)) fail(`${cc}: bad time zone list`);
      for (const z of list || []) if (!isTimeZone(z)) fail(`${cc}: unknown time zone ${z}`);
    }
    if (r.formats) {
      const f = r.formats;
      if (!/DD/.test(f.dateFormat) || !/MM/.test(f.dateFormat) || !/YYYY/.test(f.dateFormat)) fail(`${cc}: bad date format ${f.dateFormat}`);
      if (!/mm/.test(f.timeFormat) || !/(HH|h)/.test(f.timeFormat)) fail(`${cc}: bad time format ${f.timeFormat}`);
      if (/h(?!H)/.test(f.timeFormat.replace(/HH/g, '')) !== /a/.test(f.timeFormat)) fail(`${cc}: 12-hour format without day period ${f.timeFormat}`);
      if (!WEEKDAYS.has(f.firstDayOfWeek)) fail(`${cc}: bad first day ${f.firstDayOfWeek}`);
      if (!f.decimalSeparator || !f.groupingSeparator || f.decimalSeparator === f.groupingSeparator) fail(`${cc}: bad number separators`);
    }
    if (r.measurements) {
      const m = r.measurements;
      if (!['metric', 'US', 'UK'].includes(m.measurementSystem)) fail(`${cc}: bad measurement system`);
      if (m.distanceUnit && !['kilometer', 'mile'].includes(m.distanceUnit)) fail(`${cc}: bad distance unit`);
      if (m.roadSpeedUnit && !['km/h', 'mph'].includes(m.roadSpeedUnit)) fail(`${cc}: bad road speed unit`);
      if (m.temperatureUnit && !['celsius', 'fahrenheit'].includes(m.temperatureUnit)) fail(`${cc}: bad temperature unit`);
      if (m.weightUnit && !['kilogram', 'pound'].includes(m.weightUnit)) fail(`${cc}: bad weight unit`);
    }
    if (r.electricity) {
      const e = r.electricity;
      if (!e.voltage?.length || e.voltage.some((v: number) => !Number.isInteger(v) || v < 90 || v > 260)) fail(`${cc}: bad voltage`);
      if (!e.frequency?.length || e.frequency.some((v: number) => v !== 50 && v !== 60)) fail(`${cc}: bad frequency`);
      if (!e.plugTypes?.length || !uniqueList(e.plugTypes) || e.plugTypes.some((p: string) => !(PLUG_TYPES as readonly string[]).includes(p))) fail(`${cc}: bad plug types`);
    }
    if (r.driving && !['left', 'right'].includes(r.driving.drivingSide)) fail(`${cc}: bad driving side`);
    if (r.emergency) {
      const e = r.emergency;
      if (e.numbers && (!e.numbers.length || !uniqueList(e.numbers) || e.numbers.some((n: string) => !/^\d{2,6}$/.test(n)))) fail(`${cc}: bad emergency numbers`);
      for (const k of ['general', 'police', 'ambulance', 'fire']) if (e[k] !== undefined && !/^\d{2,6}$/.test(e[k])) fail(`${cc}: bad emergency.${k}`);
    }
    for (const [group, meta] of Object.entries(r._meta || {}) as [string, any][]) {
      if (!(GROUPS as readonly string[]).includes(group)) fail(`${cc}._meta: unknown group ${group}`);
      if (meta.status && !STATUSES.has(meta.status)) fail(`${cc}._meta.${group}: bad status`);
      if (meta.status === 'verified' && (!meta.source || !meta.verifiedAt)) fail(`${cc}._meta.${group}: verified without source + verifiedAt`);
      if (!meta.source && !meta.status) fail(`${cc}._meta.${group}: provenance entry with neither source nor status`);
    }
  }
  return problems;
}

export function validateOverrides(list: any[], codes: Set<string>): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const o of list) {
    const tag = `${o.iso2}:${o.field}`;
    if (!codes.has(o.iso2)) problems.push(`override ${tag}: unknown country`);
    const [group, field] = String(o.field).split('.');
    if (!FIELD_OWNERSHIP[group as GroupName]?.includes(field)) problems.push(`override ${tag}: field not owned by ${group}`);
    for (const k of ['reason', 'source', 'verifiedAt']) if (!o[k]) problems.push(`override ${tag}: ${k} missing`);
    if (seen.has(tag)) problems.push(`override ${tag}: duplicate override`);
    seen.add(tag);
  }
  return problems;
}
