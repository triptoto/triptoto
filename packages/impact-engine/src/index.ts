import type { Connection, Severity, TripItem } from '../../domain/src/index.ts';

export interface ConnectionAssessment {
  connectionId: string;
  severity: Severity;
  outcome: 'comfortable' | 'tight' | 'unlikely' | 'unknown';
  bufferMinutes?: number;
  explanationCode: string;
  availableMinutes?: number;
  requiredMinutes?: number;
}

export interface LiveFlightImpactInput {
  itemId: string;
  disruptionState: 'none' | 'delayed' | 'cancelled' | 'diverted' | 'unknown';
  delayMinutes?: number;
  cancellationConfirmed?: boolean;
}

export interface LiveFlightImpactAssessment {
  impactType: 'time' | 'status';
  severity: Severity;
  explanationCode: string;
}

export function assessLiveFlightImpact(input: LiveFlightImpactInput): LiveFlightImpactAssessment | undefined {
  if (input.disruptionState === 'cancelled') {
    return input.cancellationConfirmed
      ? { impactType: 'status', severity: 'high', explanationCode: 'FLIGHT_CANCELLATION_CONFIRMED' }
      : { impactType: 'status', severity: 'medium', explanationCode: 'FLIGHT_CANCELLATION_REPORTED' };
  }
  if (input.disruptionState === 'diverted') return { impactType: 'status', severity: 'high', explanationCode: 'FLIGHT_DIVERTED' };
  if (input.disruptionState === 'delayed' || (input.delayMinutes ?? 0) > 0) {
    const minutes = input.delayMinutes ?? 0;
    if (minutes >= 120) return { impactType: 'time', severity: 'high', explanationCode: 'FLIGHT_DELAY_120_PLUS' };
    if (minutes >= 45) return { impactType: 'time', severity: 'medium', explanationCode: 'FLIGHT_DELAY_45_PLUS' };
    return { impactType: 'time', severity: 'low', explanationCode: 'FLIGHT_DELAY_REPORTED' };
  }
  return undefined;
}

export const CONNECTION_REQUIREMENT_MINUTES = {
  terminalChange: 15,
  immigration: 45,
  security: 30,
  baggageReclaim: 30,
  airportChange: 60,
} as const;

export function requiredConnectionMinutes(connection: Connection): number | undefined {
  const configured = connection.recommendedBufferMinutes ?? connection.minimumBufferMinutes;
  if (configured == null) return undefined;
  return configured
    + (connection.requiresTerminalChange ? CONNECTION_REQUIREMENT_MINUTES.terminalChange : 0)
    + (connection.requiresImmigration ? CONNECTION_REQUIREMENT_MINUTES.immigration : 0)
    + (connection.requiresSecurity ? CONNECTION_REQUIREMENT_MINUTES.security : 0)
    + (connection.requiresBaggageReclaim ? CONNECTION_REQUIREMENT_MINUTES.baggageReclaim : 0)
    + (connection.requiresAirportChange ? CONNECTION_REQUIREMENT_MINUTES.airportChange : 0);
}

export function assessConnection(from: TripItem, to: TripItem, connection: Connection): ConnectionAssessment {
  if (from.status === 'cancelled' || to.status === 'cancelled') {
    return { connectionId: connection.id, severity: 'high', outcome: 'unknown', explanationCode: 'CANCELLED_SEGMENT' };
  }
  if (from.endsAtUtc == null || to.startsAtUtc == null) {
    return { connectionId: connection.id, severity: 'info', outcome: 'unknown', explanationCode: 'MISSING_TIMES' };
  }
  const available = Math.floor((to.startsAtUtc - from.endsAtUtc) / 60_000);
  const required = requiredConnectionMinutes(connection);
  if (required == null) {
    return { connectionId: connection.id, severity: 'info', outcome: 'unknown', bufferMinutes: available, availableMinutes: available, explanationCode: 'BUFFER_UNKNOWN' };
  }

  const margin = available - required;
  const detail = { connectionId: connection.id, bufferMinutes: margin, availableMinutes: available, requiredMinutes: required };
  if (connection.requiresAirportChange && available < 180) return { ...detail, severity: 'critical', outcome: 'unlikely', explanationCode: 'AIRPORT_CHANGE_TOO_TIGHT' };
  if (margin < 0) return { ...detail, severity: 'critical', outcome: 'unlikely', explanationCode: 'INSUFFICIENT_BUFFER' };
  if (margin < 30) return { ...detail, severity: 'high', outcome: 'tight', explanationCode: 'LOW_BUFFER' };
  if (connection.type === 'self_transfer' && available < 180) return { ...detail, severity: 'medium', outcome: 'tight', explanationCode: 'SELF_TRANSFER_REVIEW' };
  return { ...detail, severity: 'info', outcome: 'comfortable', explanationCode: 'SUFFICIENT_BUFFER' };
}
