import type {
  FlightDisruptionState,
  FlightLookup,
  FlightOperationalPhase,
  FlightProvider,
  FlightStatus,
} from './index.ts';

export interface AeroDataBoxProviderOptions {
  apiKey: string;
  host?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class FlightProviderRequestError extends Error {
  constructor(
    public readonly category: 'rate_limited' | 'provider_error' | 'timeout' | 'invalid_response',
    message: string,
    public readonly status?: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

interface AeroMovement {
  airport?: { iata?: unknown; icao?: unknown };
  scheduledTime?: { utc?: unknown; local?: unknown };
  revisedTime?: { utc?: unknown; local?: unknown };
  predictedTime?: { utc?: unknown; local?: unknown };
  runwayTime?: { utc?: unknown; local?: unknown };
  terminal?: unknown;
  gate?: unknown;
  baggageBelt?: unknown;
}

interface AeroFlight {
  number?: unknown;
  status?: unknown;
  codeshareStatus?: unknown;
  lastUpdatedUtc?: unknown;
  airline?: { iata?: unknown; icao?: unknown; name?: unknown };
  departure?: AeroMovement;
  arrival?: AeroMovement;
}

interface NormalizedCandidate {
  number: string;
  airlineCode?: string;
  status: string;
  codeshareStatus: string;
  departureAirport?: string;
  arrivalAirport?: string;
  departureDateLocal?: string;
  scheduledDepartureUtc?: number;
  scheduledArrivalUtc?: number;
  estimatedDepartureUtc?: number;
  estimatedArrivalUtc?: number;
  actualDepartureUtc?: number;
  actualArrivalUtc?: number;
  departureTerminal?: string;
  departureGate?: string;
  arrivalTerminal?: string;
  arrivalGate?: string;
  baggageBelt?: string;
  providerUpdatedAt?: number;
}

export class AeroDataBoxFlightProvider implements FlightProvider {
  readonly name = 'aerodatabox';
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: AeroDataBoxProviderOptions) {
    if (!options.apiKey.trim()) throw new Error('AeroDataBox API key is required.');
    this.host = normalizeHost(options.host ?? 'aerodatabox.p.rapidapi.com');
    this.timeoutMs = boundedInteger(options.timeoutMs, 7_000, 1_000, 15_000);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  async health(): Promise<'healthy' | 'degraded' | 'disabled' | 'unknown'> {
    return this.options.apiKey.trim() ? 'healthy' : 'disabled';
  }

  async getStatus(query: FlightLookup): Promise<FlightStatus> {
    const lookupNumber = lookupFlightNumber(query);
    if (!lookupNumber || !/^\d{4}-\d{2}-\d{2}$/.test(query.departureDateLocal)) {
      return { available: false, reason: 'unavailable', provider: this.name, matchStatus: 'unavailable' };
    }
    const url = new URL(`https://${this.host}/flights/number/${encodeURIComponent(lookupNumber)}/${query.departureDateLocal}`);
    url.searchParams.set('withLocation', 'false');
    url.searchParams.set('withAircraftImage', 'false');
    url.searchParams.set('withFlightImage', 'false');
    url.searchParams.set('dateLocalRole', 'Departure');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'x-rapidapi-key': this.options.apiKey,
          'x-rapidapi-host': this.host,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new FlightProviderRequestError('timeout', 'The live-flight provider timed out.');
      }
      throw new FlightProviderRequestError('provider_error', 'The live-flight provider could not be reached.');
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 429) {
      throw new FlightProviderRequestError('rate_limited', 'The live-flight provider rate limit was reached.', 429, parseRetryAfter(response.headers.get('retry-after')));
    }
    if (response.status === 404) {
      return { available: false, reason: 'not_found', provider: this.name, matchStatus: 'not_found', fetchedAt: this.now() };
    }
    if (!response.ok) {
      throw new FlightProviderRequestError('provider_error', 'The live-flight provider returned an error.', response.status);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new FlightProviderRequestError('invalid_response', 'The live-flight provider response was not valid JSON.', response.status);
    }
    if (!Array.isArray(payload)) throw new FlightProviderRequestError('invalid_response', 'The live-flight provider response shape was invalid.', response.status);
    const candidates = payload.map(normalizeCandidate).filter((value): value is NormalizedCandidate => value !== null);
    const matched = matchAeroDataBoxCandidates(candidates, query);
    if (!matched.candidate) {
      return {
        available: false,
        reason: matched.reason,
        provider: this.name,
        matchStatus: matched.reason === 'ambiguous' ? 'ambiguous' : 'not_found',
        fetchedAt: this.now(),
      };
    }
    const selected = matched.candidate;
    const operator = findOperatingCandidate(selected, candidates);
    const status = normalizeStatus(selected.status);
    const marketingNumber = splitFlightNumber(selected.number);
    const operatingNumber = operator ? splitFlightNumber(operator.number) : undefined;
    return compact({
      available: true,
      provider: this.name,
      providerFlightId: stableProviderFlightId(selected),
      matchStatus: 'matched',
      confidence: matched.confidence,
      operationalPhase: status.operationalPhase,
      disruptionState: status.disruptionState,
      scheduledDepartureUtc: selected.scheduledDepartureUtc,
      scheduledArrivalUtc: selected.scheduledArrivalUtc,
      estimatedDepartureUtc: selected.estimatedDepartureUtc,
      estimatedArrivalUtc: selected.estimatedArrivalUtc,
      actualDepartureUtc: selected.actualDepartureUtc,
      actualArrivalUtc: selected.actualArrivalUtc,
      departureTerminal: selected.departureTerminal,
      departureGate: selected.departureGate,
      arrivalTerminal: selected.arrivalTerminal,
      arrivalGate: selected.arrivalGate,
      baggageBelt: selected.baggageBelt,
      marketingAirlineCode: marketingNumber?.carrier ?? selected.airlineCode,
      marketingFlightNumber: marketingNumber?.number,
      operatingAirlineCode: operatingNumber?.carrier,
      operatingFlightNumber: operatingNumber?.number,
      providerStatus: selected.status,
      providerUpdatedAt: selected.providerUpdatedAt,
      fetchedAt: this.now(),
    }) as FlightStatus;
  }
}

export function matchAeroDataBoxCandidates(candidates: NormalizedCandidate[], query: FlightLookup): { candidate?: NormalizedCandidate; confidence?: number; reason?: 'not_found' | 'ambiguous' } {
  const marketing = normalizeFlightNumber(`${query.marketingCarrier ?? ''}${query.flightNumber}`);
  const direct = normalizeFlightNumber(query.flightNumber);
  const operating = normalizeFlightNumber(`${query.operatingCarrier ?? ''}${query.operatingFlightNumber ?? ''}`);
  const departure = upperCode(query.departureAirport);
  const arrival = upperCode(query.arrivalAirport);
  const scored = candidates.flatMap(candidate => {
    const number = normalizeFlightNumber(candidate.number);
    const numberScore = number === marketing || number === direct ? 50 : operating && number === operating ? 45 : 0;
    if (!numberScore || candidate.departureDateLocal !== query.departureDateLocal) return [];
    if (departure && candidate.departureAirport !== departure) return [];
    if (arrival && candidate.arrivalAirport !== arrival) return [];
    const score = numberScore + 25 + (departure ? 15 : 0) + (arrival ? 10 : 0);
    return [{ candidate, score }];
  }).sort((a, b) => b.score - a.score || candidateKey(a.candidate).localeCompare(candidateKey(b.candidate)));
  if (!scored.length) return { reason: 'not_found' };
  const first = scored[0];
  const second = scored[1];
  if (first.score < 75 || (second && second.score === first.score && candidateKey(second.candidate) !== candidateKey(first.candidate))) {
    return { reason: 'ambiguous' };
  }
  return { candidate: first.candidate, confidence: first.score };
}

function normalizeCandidate(value: unknown): NormalizedCandidate | null {
  if (!value || typeof value !== 'object') return null;
  const flight = value as AeroFlight;
  const number = normalizeFlightNumber(stringValue(flight.number) ?? '');
  const departure = flight.departure;
  const arrival = flight.arrival;
  if (!number || !departure) return null;
  const scheduledDepartureUtc = timeValue(departure.scheduledTime?.utc);
  const departureDateLocal = localDate(departure.scheduledTime?.local);
  return compact({
    number,
    airlineCode: upperCode(stringValue(flight.airline?.iata)) || upperCode(stringValue(flight.airline?.icao)),
    status: stringValue(flight.status) || 'Unknown',
    codeshareStatus: stringValue(flight.codeshareStatus) || 'Unknown',
    departureAirport: upperCode(stringValue(departure.airport?.iata)) || upperCode(stringValue(departure.airport?.icao)),
    arrivalAirport: upperCode(stringValue(arrival?.airport?.iata)) || upperCode(stringValue(arrival?.airport?.icao)),
    departureDateLocal,
    scheduledDepartureUtc,
    scheduledArrivalUtc: timeValue(arrival?.scheduledTime?.utc),
    estimatedDepartureUtc: timeValue(departure.revisedTime?.utc) ?? timeValue(departure.predictedTime?.utc),
    estimatedArrivalUtc: timeValue(arrival?.revisedTime?.utc) ?? timeValue(arrival?.predictedTime?.utc),
    actualDepartureUtc: timeValue(departure.runwayTime?.utc),
    actualArrivalUtc: timeValue(arrival?.runwayTime?.utc),
    departureTerminal: stringValue(departure.terminal),
    departureGate: stringValue(departure.gate),
    arrivalTerminal: stringValue(arrival?.terminal),
    arrivalGate: stringValue(arrival?.gate),
    baggageBelt: stringValue(arrival?.baggageBelt),
    providerUpdatedAt: timeValue(flight.lastUpdatedUtc),
  }) as NormalizedCandidate;
}

function findOperatingCandidate(selected: NormalizedCandidate, candidates: NormalizedCandidate[]): NormalizedCandidate | undefined {
  if (selected.codeshareStatus.toLowerCase() === 'isoperator') return selected;
  return candidates.find(candidate => candidate.codeshareStatus.toLowerCase() === 'isoperator'
    && candidate.departureAirport === selected.departureAirport
    && candidate.arrivalAirport === selected.arrivalAirport
    && candidate.scheduledDepartureUtc === selected.scheduledDepartureUtc);
}

function normalizeStatus(value: string): { operationalPhase: FlightOperationalPhase; disruptionState: FlightDisruptionState } {
  const status = value.toLowerCase().replace(/[^a-z]/g, '');
  if (status === 'canceled' || status === 'cancelled' || status === 'canceleduncertain' || status === 'cancelleduncertain') return { operationalPhase: 'unknown', disruptionState: 'cancelled' };
  if (status === 'diverted') return { operationalPhase: 'en_route', disruptionState: 'diverted' };
  if (status === 'delayed') return { operationalPhase: 'scheduled', disruptionState: 'delayed' };
  if (status === 'boarding' || status === 'gateclosed' || status === 'checkin') return { operationalPhase: 'boarding', disruptionState: 'none' };
  if (status === 'departed') return { operationalPhase: 'departed', disruptionState: 'none' };
  if (status === 'enroute' || status === 'approaching') return { operationalPhase: 'en_route', disruptionState: 'none' };
  if (status === 'arrived') return { operationalPhase: 'landed', disruptionState: 'none' };
  if (status === 'expected') return { operationalPhase: 'scheduled', disruptionState: 'none' };
  return { operationalPhase: 'unknown', disruptionState: 'unknown' };
}

function lookupFlightNumber(query: FlightLookup): string {
  const direct = normalizeFlightNumber(query.flightNumber);
  if (!direct) return '';
  if (/^[A-Z]{2,3}\d/.test(direct)) return direct;
  return normalizeFlightNumber(`${query.marketingCarrier ?? query.operatingCarrier ?? ''}${direct}`);
}

function normalizeHost(value: string): string {
  const host = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(host)) throw new Error('AeroDataBox host is invalid.');
  return host;
}

function stableProviderFlightId(candidate: NormalizedCandidate): string {
  return `aerodatabox:${candidate.number}:${candidate.scheduledDepartureUtc ?? candidate.departureDateLocal ?? 'unknown'}`;
}

function candidateKey(candidate: NormalizedCandidate): string {
  return [candidate.number, candidate.departureAirport, candidate.arrivalAirport, candidate.scheduledDepartureUtc].join('|');
}

function splitFlightNumber(value: string): { carrier: string; number: string } | undefined {
  const match = normalizeFlightNumber(value).match(/^([A-Z]{2,3})(\d+[A-Z]?)$/);
  return match ? { carrier: match[1], number: match[2] } : undefined;
}

function normalizeFlightNumber(value: string): string { return value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function upperCode(value: string | undefined): string | undefined { const out = value?.trim().toUpperCase(); return out || undefined; }
function stringValue(value: unknown): string | undefined { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
function localDate(value: unknown): string | undefined { const text = stringValue(value); const match = text?.match(/^(\d{4}-\d{2}-\d{2})/); return match?.[1]; }
function timeValue(value: unknown): number | undefined { const text = stringValue(value); if (!text) return undefined; const time = Date.parse(text); return Number.isFinite(time) ? time : undefined; }
function parseRetryAfter(value: string | null): number | undefined { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined; }
function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number { return Number.isInteger(value) ? Math.min(max, Math.max(min, Number(value))) : fallback; }
function compact<T extends Record<string, unknown>>(value: T): Partial<T> { return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null && entry !== '')) as Partial<T>; }
