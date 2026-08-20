import type { Connection, Severity, TripItem } from '../../domain/src/index.ts';

export interface ConnectionAssessment {
  connectionId: string;
  severity: Severity;
  outcome: 'comfortable' | 'tight' | 'unlikely' | 'unknown';
  bufferMinutes?: number;
  explanationCode: string;
}

export function assessConnection(from: TripItem, to: TripItem, connection: Connection): ConnectionAssessment {
  if (from.endsAtUtc == null || to.startsAtUtc == null) {
    return { connectionId: connection.id, severity: 'info', outcome: 'unknown', explanationCode: 'MISSING_TIMES' };
  }
  const available = Math.floor((to.startsAtUtc - from.endsAtUtc) / 60_000);
  let required = connection.recommendedBufferMinutes ?? connection.minimumBufferMinutes;
  if (required == null) {
    return { connectionId: connection.id, severity: 'info', outcome: 'unknown', bufferMinutes: available, explanationCode: 'BUFFER_UNKNOWN' };
  }
  if (connection.requiresAirportChange) required += 60;
  if (connection.requiresBaggageReclaim) required += 30;

  const margin = available - required;
  if (margin < 0) return { connectionId: connection.id, severity: 'critical', outcome: 'unlikely', bufferMinutes: margin, explanationCode: 'INSUFFICIENT_BUFFER' };
  if (margin < 30) return { connectionId: connection.id, severity: 'high', outcome: 'tight', bufferMinutes: margin, explanationCode: 'LOW_BUFFER' };
  return { connectionId: connection.id, severity: 'info', outcome: 'comfortable', bufferMinutes: margin, explanationCode: 'SUFFICIENT_BUFFER' };
}
