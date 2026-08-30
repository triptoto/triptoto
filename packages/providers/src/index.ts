export type FlightOperationalPhase = 'scheduled' | 'boarding' | 'departed' | 'en_route' | 'landed' | 'unknown';
export type FlightDisruptionState = 'none' | 'delayed' | 'cancelled' | 'diverted' | 'unknown';
export type FlightMatchStatus = 'matched' | 'ambiguous' | 'not_found' | 'unavailable';
export type FlightStatusUnavailableReason = 'disabled' | 'unavailable' | 'not_found' | 'ambiguous' | 'rate_limited' | 'provider_error' | 'timeout';

export interface FlightLookup {
  marketingCarrier?: string;
  flightNumber: string;
  operatingCarrier?: string;
  operatingFlightNumber?: string;
  departureDateLocal: string;
  departureAirport?: string;
  arrivalAirport?: string;
}

export interface FlightStatus {
  available: boolean;
  reason?: FlightStatusUnavailableReason;
  provider?: string;
  providerFlightId?: string;
  matchStatus?: FlightMatchStatus;
  confidence?: number;
  operationalPhase?: FlightOperationalPhase;
  disruptionState?: FlightDisruptionState;
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
  marketingAirlineCode?: string;
  marketingFlightNumber?: string;
  operatingAirlineCode?: string;
  operatingFlightNumber?: string;
  providerStatus?: string;
  providerUpdatedAt?: number;
  fetchedAt?: number;
}
export interface FlightProvider {
  readonly name: string;
  health(): Promise<'healthy' | 'degraded' | 'disabled' | 'unknown'>;
  getStatus(query: FlightLookup): Promise<FlightStatus>;
}

export class DisabledFlightProvider implements FlightProvider {
  readonly name = 'disabled';
  async health() { return 'disabled' as const; }
  async getStatus(): Promise<FlightStatus> { return { available: false, reason: 'disabled', matchStatus: 'unavailable' }; }
}

export interface AIProvider {
  readonly enabled: false;
}
export const disabledAIProvider: AIProvider = { enabled: false };
