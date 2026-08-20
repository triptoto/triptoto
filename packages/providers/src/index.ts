export interface FlightLookup { marketingCarrier?: string; flightNumber: string; departureDateLocal: string; departureAirport?: string; }
export interface FlightStatus { available: boolean; reason?: 'disabled' | 'unavailable'; }
export interface FlightProvider {
  readonly name: string;
  health(): Promise<'healthy' | 'degraded' | 'disabled' | 'unknown'>;
  getStatus(query: FlightLookup): Promise<FlightStatus>;
}

export class DisabledFlightProvider implements FlightProvider {
  readonly name = 'disabled';
  async health() { return 'disabled' as const; }
  async getStatus(): Promise<FlightStatus> { return { available: false, reason: 'disabled' }; }
}

export interface AIProvider {
  readonly enabled: false;
}
export const disabledAIProvider: AIProvider = { enabled: false };
