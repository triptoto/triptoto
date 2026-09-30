import airlineData from '../data/airlines.json';

// Global Airline Flight Status directory.
//
// Design constraints (hard rules):
//  - Source of truth is airline-owned domains ONLY. Never aggregators, trackers
//    (FlightAware / Flightradar24 / airport boards), agencies, blogs, or wikis.
//  - Deterministic normalization: "BA286", "BA 286", "ba286", "BA-286" resolve
//    identically. No fuzzy matching — an unknown code returns null, never a guess.
//  - No random fallbacks and no invented URLs. Resolution degrades in a fixed
//    order (deep-link -> status page -> official homepage) and stops at null.
//  - Every emitted URL is https:// and passes a scheme allow-list.
//  - Zero flight APIs, zero paid services, zero API keys, zero scraping.

export interface AirlineDirectoryEntry {
  name: string;
  iata?: string;
  icao?: string;
  aliases?: string[];
  country: string;
  officialDomain: string;
  officialWebsiteUrl: string;
  /** Dedicated flight-status page on the airline's own site (no flight number). */
  flightStatusUrl?: string;
  /**
   * Deep-link template on the airline's own site. Supported tokens (all optional):
   *   {iata} {icao} {flightNumber} {flightDesignator} {date}
   * `date` is a caller-supplied YYYY-MM-DD string. Only populated where the
   * official pattern is well-established; otherwise omitted.
   */
  statusUrlTemplate?: string;
  active: boolean;
}

export type ResolutionLevel = 'deep-link' | 'status-page' | 'homepage';

export interface ParsedFlightDesignator {
  /** Normalized carrier code (letters+digits, upper-cased, punctuation stripped). */
  carrier: string;
  /** Numeric flight number without carrier prefix, leading zeros preserved as typed. */
  number: string;
  /** Optional operational suffix (e.g. the "A" in "BA286A"). */
  suffix?: string;
}

export interface FlightStatusResolution {
  airline: AirlineDirectoryEntry;
  url: string;
  level: ResolutionLevel;
  /** True only when the URL already targets the specific flight (deep-link). */
  prefilled: boolean;
  /** Which carrier role matched: the operator (preferred) or the marketing carrier. */
  matchedBy: 'operating' | 'marketing';
  /**
   * When level is not "deep-link", the flight designator the traveler should paste
   * into the airline page. The UI can surface this with a copy-to-clipboard toast.
   */
  copyDesignator?: string;
}

export interface ResolveInput {
  marketingCarrier?: string;
  operatingCarrier?: string;
  /** Flight number; may include the carrier prefix (e.g. "BA 286") or be numeric only. */
  flightNumber?: string;
}

const SAFE_URL = /^https:\/\/[^\s]+$/i;
const BLOCKED_SCHEMES = /^(?:javascript|data|file|intent|vbscript|blob|about):/i;

/** True only for a plain https:// URL with no blocked scheme smuggled in. */
export function isSafeStatusUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || BLOCKED_SCHEMES.test(trimmed)) return false;
  if (!SAFE_URL.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Uppercase, strip everything that is not A-Z/0-9. Deterministic, no fuzzing. */
export function normalizeCarrierCode(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Parse a flight designator into carrier + number. Accepts "BA286", "BA 286",
 * "ba-286", "BA286A". Returns null when it cannot find a carrier code followed by
 * a number (no guessing).
 */
export function parseFlightDesignator(value: unknown): ParsedFlightDesignator | null {
  const compact = normalizeCarrierCode(value);
  // Carrier code is 2-3 chars: two letters, or a letter+digit / digit+letter pair.
  const match = compact.match(/^([A-Z]{2,3}|[A-Z]\d|\d[A-Z])(\d{1,4})([A-Z]?)$/);
  if (!match) return null;
  const [, carrier, number, suffix] = match;
  return { carrier, number, suffix: suffix || undefined };
}

function toEntry(raw: unknown): AirlineDirectoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const name = typeof value.name === 'string' ? value.name : '';
  const officialWebsiteUrl = typeof value.officialWebsiteUrl === 'string' ? value.officialWebsiteUrl : '';
  if (!name || !isSafeStatusUrl(officialWebsiteUrl)) return null;
  const entry: AirlineDirectoryEntry = {
    name,
    country: typeof value.country === 'string' ? value.country : '',
    officialDomain: typeof value.officialDomain === 'string' ? value.officialDomain : '',
    officialWebsiteUrl,
    active: value.active !== false,
  };
  if (typeof value.iata === 'string') entry.iata = value.iata.toUpperCase();
  if (typeof value.icao === 'string') entry.icao = value.icao.toUpperCase();
  if (Array.isArray(value.aliases)) entry.aliases = value.aliases.filter((a): a is string => typeof a === 'string');
  // Only accept status URLs that pass the safety gate; otherwise drop to homepage.
  if (isSafeStatusUrl(value.flightStatusUrl)) entry.flightStatusUrl = value.flightStatusUrl as string;
  if (typeof value.statusUrlTemplate === 'string' && value.statusUrlTemplate.startsWith('https://')) {
    entry.statusUrlTemplate = value.statusUrlTemplate;
  }
  return entry;
}

const ENTRIES: readonly AirlineDirectoryEntry[] = Object.freeze(
  (Array.isArray((airlineData as { airlines?: unknown[] }).airlines) ? (airlineData as { airlines: unknown[] }).airlines : [])
    .map(toEntry)
    .filter((e): e is AirlineDirectoryEntry => e !== null),
);

const BY_IATA = new Map<string, AirlineDirectoryEntry>();
const BY_ICAO = new Map<string, AirlineDirectoryEntry>();
for (const entry of ENTRIES) {
  if (entry.iata) BY_IATA.set(normalizeCarrierCode(entry.iata), entry);
  if (entry.icao) BY_ICAO.set(normalizeCarrierCode(entry.icao), entry);
}

export const byIata: ReadonlyMap<string, AirlineDirectoryEntry> = BY_IATA;
export const byIcao: ReadonlyMap<string, AirlineDirectoryEntry> = BY_ICAO;

/** Look up an airline by an IATA (2) or ICAO (3) code. No fuzzy matching. */
export function findAirline(code: unknown): AirlineDirectoryEntry | null {
  const normalized = normalizeCarrierCode(code);
  if (!normalized) return null;
  if (normalized.length === 3) return BY_ICAO.get(normalized) ?? BY_IATA.get(normalized) ?? null;
  return BY_IATA.get(normalized) ?? BY_ICAO.get(normalized) ?? null;
}

function buildDeepLink(entry: AirlineDirectoryEntry, parsed: ParsedFlightDesignator | null, date?: string): string | null {
  if (!entry.statusUrlTemplate || !parsed) return null;
  const designator = `${parsed.carrier}${parsed.number}${parsed.suffix ?? ''}`;
  const url = entry.statusUrlTemplate
    .replace(/\{iata\}/g, encodeURIComponent(entry.iata ?? ''))
    .replace(/\{icao\}/g, encodeURIComponent(entry.icao ?? ''))
    .replace(/\{flightNumber\}/g, encodeURIComponent(parsed.number))
    .replace(/\{flightDesignator\}/g, encodeURIComponent(designator))
    .replace(/\{date\}/g, encodeURIComponent(date ?? ''));
  // A template that still contains an unfilled token, or produces an unsafe URL,
  // is rejected rather than emitted half-built.
  if (/\{[a-z]+\}/i.test(url) || !isSafeStatusUrl(url)) return null;
  return url;
}

/**
 * Resolve the best official flight-status destination for a flight.
 *
 * Airline selection order: operating carrier, then marketing carrier (codeshares
 * are tracked by the operator). Within the matched airline, URL selection order:
 * deep-link -> dedicated status page (+copy designator) -> official homepage.
 *
 * Returns null when no airline matches — there is intentionally no generic
 * fallback tracker.
 */
export function resolveFlightStatus(input: ResolveInput, options: { date?: string } = {}): FlightStatusResolution | null {
  const parsed = parseFlightDesignator(input.flightNumber);
  const operatingCode = normalizeCarrierCode(input.operatingCarrier);
  const marketingCode = normalizeCarrierCode(input.marketingCarrier);
  // If the flight number itself carries a code and no explicit carrier is given,
  // fall back to the parsed carrier for the marketing lookup.
  const marketingFromNumber = !marketingCode && parsed ? parsed.carrier : marketingCode;

  const candidates: Array<{ code: string; role: 'operating' | 'marketing' }> = [];
  if (operatingCode) candidates.push({ code: operatingCode, role: 'operating' });
  if (marketingFromNumber) candidates.push({ code: marketingFromNumber, role: 'marketing' });

  for (const candidate of candidates) {
    const airline = findAirline(candidate.code);
    if (!airline) continue;

    const deepLink = buildDeepLink(airline, parsed, options.date);
    if (deepLink) {
      return { airline, url: deepLink, level: 'deep-link', prefilled: true, matchedBy: candidate.role };
    }

    const designator = parsed ? `${parsed.carrier}${parsed.number}${parsed.suffix ?? ''}` : undefined;
    if (airline.flightStatusUrl) {
      return {
        airline,
        url: airline.flightStatusUrl,
        level: 'status-page',
        prefilled: false,
        matchedBy: candidate.role,
        copyDesignator: designator,
      };
    }
    return {
      airline,
      url: airline.officialWebsiteUrl,
      level: 'homepage',
      prefilled: false,
      matchedBy: candidate.role,
      copyDesignator: designator,
    };
  }
  return null;
}

export function allAirlines(): readonly AirlineDirectoryEntry[] {
  return ENTRIES;
}

export function activeAirlines(): readonly AirlineDirectoryEntry[] {
  return ENTRIES.filter((e) => e.active);
}

export function airlineDirectoryCount(): number {
  return ENTRIES.length;
}
