import rawData from '../data/countries.generated.json';
import { GROUPS, type CountryDataset, type CountryRecord, type GroupName, type GroupStatus, type SourceInfo } from './schema.ts';

// Worldwide Country Guide: read-only selectors over the generated snapshot plus
// the ONE shared comparison module used by the Country Guide screen, Trip Brain
// and the checklist. Pure and offline: no network, no storage, no inference of
// the home country (callers pass the explicitly selected one).

export * from './schema.ts';
export const dataset = rawData as unknown as CountryDataset;

const norm = (iso2: unknown) => String(iso2 || '').trim().toUpperCase();

export function getCountry(iso2: unknown): CountryRecord | null {
  return dataset.countries[norm(iso2)] || null;
}
export function hasCountry(iso2: unknown): boolean {
  return Boolean(getCountry(iso2));
}
export function listCountryCodes(): string[] {
  return Object.keys(dataset.countries);
}
export function countryCount(): number {
  return listCountryCodes().length;
}

// ------------------------------------------------------------ derived values
export function countryName(iso2: unknown, locale = 'en'): string {
  const code = norm(iso2);
  try {
    const name = new Intl.DisplayNames([locale, 'en'], { type: 'region', fallback: 'none' }).of(code);
    if (name) return name;
  } catch { /* fall through */ }
  return getCountry(code)?.identity.name || code;
}
export function flagEmoji(iso2: unknown): string {
  const code = norm(iso2);
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
export function primaryCurrency(iso2: unknown): string | null {
  return getCountry(iso2)?.currency?.currencies[0] || null;
}
export function isMultiZone(iso2: unknown): boolean {
  return (getCountry(iso2)?.time?.timeZones.length || 0) > 1;
}
export type ClockPreference = '12h' | '24h';
export function clockPreference(iso2: unknown): ClockPreference | null {
  const pattern = getCountry(iso2)?.formats?.timeFormat;
  if (!pattern) return null;
  return /a/.test(pattern) ? '12h' : '24h';
}
// Countries sharing the same calling code (e.g. the NANP "+1").
export function sharedCallingCodeCountries(iso2: unknown): string[] {
  const code = getCountry(iso2)?.telecom?.callingCodes[0];
  if (!code) return [];
  return listCountryCodes().filter((cc) => cc !== norm(iso2) && dataset.countries[cc].telecom?.callingCodes.includes(code));
}

// ------------------------------------------------------------ provenance
export function groupStatus(iso2: unknown, group: GroupName): GroupStatus {
  const record = getCountry(iso2);
  if (!record || !(record as any)[group]) return 'unavailable';
  return record._meta?.[group]?.status || dataset.groups[group]?.status || 'unavailable';
}
export function groupSources(iso2: unknown, group: GroupName): SourceInfo[] {
  const record = getCountry(iso2);
  const own = record?._meta?.[group]?.source;
  const ids = own ? [own] : dataset.groups[group]?.sources || [];
  return ids.map((id) => dataset.sources.find((s) => s.id === id)).filter(Boolean) as SourceInfo[];
}
export function availableGroups(iso2: unknown): GroupName[] {
  return GROUPS.filter((g) => groupStatus(iso2, g) !== 'unavailable');
}

// ------------------------------------------------------------ time
// Offset in minutes east of UTC for an IANA zone at an instant (DST-aware).
export function zoneOffsetMinutes(zone: string, at: Date = new Date()): number | null {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || '';
    if (part === 'GMT' || part === 'UTC') return 0;
    const m = /([+-])(\d{1,2})(?::?(\d{2}))?/.exec(part);
    if (!m) return null;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
  } catch {
    return null;
  }
}
export function timeDifferenceMinutes(fromZone: string, toZone: string, at: Date = new Date()): number | null {
  const a = zoneOffsetMinutes(fromZone, at);
  const b = zoneOffsetMinutes(toZone, at);
  return a == null || b == null ? null : b - a;
}
export function sameZoneInstant(a: string, b: string): boolean {
  try {
    return new Intl.DateTimeFormat('en', { timeZone: a }).resolvedOptions().timeZone === new Intl.DateTimeFormat('en', { timeZone: b }).resolvedOptions().timeZone;
  } catch {
    return a === b;
  }
}
// A country's single zone, or null when it has several (callers must then use
// the trip location's own zone or an explicit choice, never a guess).
export function singleTimeZone(iso2: unknown): string | null {
  const zones = getCountry(iso2)?.time?.timeZones || [];
  return zones.length === 1 ? zones[0] : null;
}

// ------------------------------------------------------------ power
// Which socket types physically accept a plug type. Conservative: same letter,
// plus the well-established Europlug (C) and Schuko/French (E/F hybrid) cases
// and US two-pin (A) into B sockets.
const PLUG_FITS: Record<string, string[]> = { A: ['A', 'B'], C: ['C', 'E', 'F'], E: ['E', 'F'], F: ['E', 'F'] };
const fits = (plug: string, sockets: string[]) => (PLUG_FITS[plug] || [plug]).some((s) => sockets.includes(s));

export type PowerResult = 'compatible' | 'adapter_recommended' | 'voltage_check_required' | 'varies' | 'unknown';
export interface PowerComparison {
  result: PowerResult;
  plugsFit: 'all' | 'some' | 'none' | 'unknown';
  voltageDiffers: boolean | null;
  frequencyDiffers: boolean | null;
  home: { voltage: number[]; frequency: number[]; plugTypes: string[] } | null;
  destination: { voltage: number[]; frequency: number[]; plugTypes: string[] } | null;
}
// Voltages within 20 V are the same supply class: 220/230/240 V and 100-127 V are two classes.
const sameVoltageClass = (a: number, b: number) => Math.abs(a - b) <= 20;

export function comparePowerCompatibility(homeIso2: unknown, destinationIso2: unknown): PowerComparison {
  const home = getCountry(homeIso2)?.electricity || null;
  const dest = getCountry(destinationIso2)?.electricity || null;
  if (!home || !dest) return { result: 'unknown', plugsFit: 'unknown', voltageDiffers: null, frequencyDiffers: null, home, destination: dest };
  const fitting = home.plugTypes.filter((p) => fits(p, dest.plugTypes)).length;
  const plugsFit = fitting === home.plugTypes.length ? 'all' : fitting === 0 ? 'none' : 'some';
  const allVoltagesMatch = home.voltage.every((h) => dest.voltage.every((d) => sameVoltageClass(h, d)));
  const anyVoltageMatch = home.voltage.some((h) => dest.voltage.some((d) => sameVoltageClass(h, d)));
  const voltageDiffers = !allVoltagesMatch;
  const frequencyDiffers = !home.frequency.every((f) => dest.frequency.includes(f));
  let result: PowerResult;
  if (!anyVoltageMatch) result = 'voltage_check_required';
  else if (plugsFit === 'none') result = 'adapter_recommended';
  else if (voltageDiffers || plugsFit === 'some' || dest.voltage.length > 1 || dest.frequency.length > 1) result = 'varies';
  else result = 'compatible';
  return { result, plugsFit, voltageDiffers, frequencyDiffers, home, destination: dest };
}

// ------------------------------------------------------------ comparison
export type DifferenceId = 'currency' | 'driving' | 'speed' | 'distance' | 'temperature' | 'weight' | 'date' | 'clock' | 'weekStart' | 'decimal' | 'calling' | 'power' | 'time';
export interface Difference { id: DifferenceId; home: string; destination: string; minutes?: number }

export interface CompareOptions { homeZone?: string | null; destinationZone?: string | null; at?: Date }

// "What changes for you": only facts that differ between the explicitly chosen
// home country and the destination. Unknown on either side is never reported
// as a difference.
export function compareCountries(homeIso2: unknown, destinationIso2: unknown, options: CompareOptions = {}): Difference[] {
  const home = getCountry(homeIso2);
  const dest = getCountry(destinationIso2);
  if (!home || !dest || (norm(homeIso2) === norm(destinationIso2) && !options.homeZone)) return [];
  const out: Difference[] = [];
  const diff = (id: DifferenceId, a: unknown, b: unknown) => {
    if (a == null || b == null || a === '' || b === '' || a === b) return;
    out.push({ id, home: String(a), destination: String(b) });
  };
  diff('currency', primaryCurrency(homeIso2), primaryCurrency(destinationIso2));
  diff('driving', home.driving?.drivingSide, dest.driving?.drivingSide);
  diff('speed', home.measurements?.roadSpeedUnit, dest.measurements?.roadSpeedUnit);
  diff('distance', home.measurements?.distanceUnit, dest.measurements?.distanceUnit);
  diff('temperature', home.measurements?.temperatureUnit, dest.measurements?.temperatureUnit);
  diff('weight', home.measurements?.weightUnit, dest.measurements?.weightUnit);
  diff('date', home.formats?.dateFormat, dest.formats?.dateFormat);
  diff('clock', clockPreference(homeIso2), clockPreference(destinationIso2));
  diff('weekStart', home.formats?.firstDayOfWeek, dest.formats?.firstDayOfWeek);
  diff('decimal', home.formats?.decimalSeparator, dest.formats?.decimalSeparator);
  diff('calling', home.telecom?.callingCodes[0], dest.telecom?.callingCodes[0]);
  const power = comparePowerCompatibility(homeIso2, destinationIso2);
  if (power.result !== 'unknown' && power.result !== 'compatible') out.push({ id: 'power', home: power.home!.plugTypes.join('/'), destination: power.destination!.plugTypes.join('/') });
  const homeZone = options.homeZone || singleTimeZone(homeIso2);
  const destZone = options.destinationZone || singleTimeZone(destinationIso2);
  if (homeZone && destZone) {
    const minutes = timeDifferenceMinutes(homeZone, destZone, options.at);
    if (minutes) out.push({ id: 'time', home: homeZone, destination: destZone, minutes });
  }
  return out;
}

// Preparation items derived from the same comparison (checklist, Trip Brain).
export interface PreparationNote { id: 'power-adapter' | 'voltage-check' | 'driving-side'; countries: string[] }
export function preparationNotes(homeIso2: unknown, destinationIso2List: unknown[]): PreparationNote[] {
  if (!hasCountry(homeIso2)) return [];
  const byId = new Map<PreparationNote['id'], string[]>();
  const add = (id: PreparationNote['id'], cc: string) => { if (!byId.has(id)) byId.set(id, []); if (!byId.get(id)!.includes(cc)) byId.get(id)!.push(cc); };
  for (const raw of destinationIso2List) {
    const cc = norm(raw);
    if (!hasCountry(cc) || cc === norm(homeIso2)) continue;
    const power = comparePowerCompatibility(homeIso2, cc);
    if (power.result === 'adapter_recommended' || power.plugsFit === 'none') add('power-adapter', cc);
    if (power.result === 'voltage_check_required') add('voltage-check', cc);
    const a = getCountry(homeIso2)?.driving?.drivingSide;
    const b = getCountry(cc)?.driving?.drivingSide;
    if (a && b && a !== b) add('driving-side', cc);
  }
  return [...byId].map(([id, countries]) => ({ id, countries }));
}

// ------------------------------------------------------------ trip countries
export interface CountryVisit { iso2: unknown; start?: string | null; end?: string | null; transit?: boolean }
export interface TripCountry { iso2: string; start: string | null; end: string | null; transitOnly: boolean }

// Deduplicates structured trip countries in order of first appearance and
// merges their date ranges. Transit-only countries (airport/station/port
// stops) are dropped unless the trip has no other country.
export function resolveTripCountries(visits: CountryVisit[]): TripCountry[] {
  const map = new Map<string, TripCountry>();
  const sorted = visits
    .map((v, index) => ({ ...v, iso2: norm(v.iso2), index }))
    .filter((v) => hasCountry(v.iso2))
    .sort((a, b) => String(a.start || '\uffff').localeCompare(String(b.start || '\uffff')) || a.index - b.index);
  for (const v of sorted) {
    const cur = map.get(v.iso2);
    const start = v.start || null;
    const end = v.end || v.start || null;
    if (!cur) { map.set(v.iso2, { iso2: v.iso2, start, end, transitOnly: Boolean(v.transit) }); continue; }
    if (start && (!cur.start || start < cur.start)) cur.start = start;
    if (end && (!cur.end || end > cur.end)) cur.end = end;
    if (!v.transit) cur.transitOnly = false;
  }
  const all = [...map.values()];
  const real = all.filter((c) => !c.transitOnly);
  return real.length ? real : all;
}
