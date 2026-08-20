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
