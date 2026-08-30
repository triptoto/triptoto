import type { FlightDisruptionState, FlightOperationalPhase, FlightStatus } from '../../providers/src/index.ts';

export interface RefreshPolicyInput {
  nowUtc: number;
  scheduledDepartureUtc: number;
  scheduledArrivalUtc?: number;
  operationalPhase?: FlightOperationalPhase;
  disruptionState?: FlightDisruptionState;
  cancellationConfirmed?: boolean;
  minRefreshMinutes: number;
}

export interface RefreshPolicy {
  eligibleNow: boolean;
  nextRefreshAt?: number;
  intervalMinutes?: number;
  freshnessMinutes?: number;
  reason: 'too_early' | 'far_upcoming' | 'upcoming' | 'departing_soon' | 'active' | 'cancellation_verification' | 'cancellation_watch' | 'finished';
}

export interface CancellationState {
  signals: number;
  firstReportedAt?: number;
  confirmedAt?: number;
  recoverySignals: number;
  recoveryFirstReportedAt?: number;
}

export interface CancellationDecision extends CancellationState {
  effectiveDisruption: FlightDisruptionState;
  event?: 'flight_cancelled_reported' | 'flight_cancelled_confirmed' | 'flight_cancellation_cleared_reported' | 'flight_cancellation_cleared';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function refreshPolicy(input: RefreshPolicyInput): RefreshPolicy {
  const min = Math.max(30, Math.floor(input.minRefreshMinutes || 60));
  const departureIn = input.scheduledDepartureUtc - input.nowUtc;
  const arrival = input.scheduledArrivalUtc ?? input.scheduledDepartureUtc + 8 * HOUR;
  if (input.operationalPhase === 'landed' || input.nowUtc > arrival + 2 * HOUR) return { eligibleNow: false, reason: 'finished' };
  if (input.cancellationConfirmed) {
    if (input.nowUtc > arrival + 24 * HOUR) return { eligibleNow: false, reason: 'finished' };
    const interval = Math.max(min, 360);
    return { eligibleNow: true, intervalMinutes: interval, freshnessMinutes: Math.max(min, 120), nextRefreshAt: input.nowUtc + interval * MINUTE, reason: 'cancellation_watch' };
  }
  if (input.disruptionState === 'cancelled') {
    const interval = Math.max(min, 30);
    return { eligibleNow: true, intervalMinutes: interval, freshnessMinutes: Math.max(min, 60), nextRefreshAt: input.nowUtc + interval * MINUTE, reason: 'cancellation_verification' };
  }
  if (departureIn > 48 * HOUR) return { eligibleNow: false, nextRefreshAt: input.scheduledDepartureUtc - 48 * HOUR, reason: 'too_early' };
  if (departureIn > 12 * HOUR) {
    const interval = Math.max(min, 720);
    return { eligibleNow: true, intervalMinutes: interval, freshnessMinutes: Math.max(min, 360), nextRefreshAt: input.nowUtc + interval * MINUTE, reason: 'far_upcoming' };
  }
  if (departureIn > 3 * HOUR) {
    const interval = Math.max(min, 240);
    return { eligibleNow: true, intervalMinutes: interval, freshnessMinutes: Math.max(min, 120), nextRefreshAt: input.nowUtc + interval * MINUTE, reason: 'upcoming' };
  }
  if (departureIn > 0) {
    const interval = Math.max(min, 90);
    return { eligibleNow: true, intervalMinutes: interval, freshnessMinutes: Math.max(min, 90), nextRefreshAt: input.nowUtc + interval * MINUTE, reason: 'departing_soon' };
  }
  const interval = Math.max(min, input.disruptionState === 'delayed' || input.operationalPhase === 'boarding' ? 60 : 120);
  return { eligibleNow: true, intervalMinutes: interval, freshnessMinutes: Math.max(min, 90), nextRefreshAt: input.nowUtc + interval * MINUTE, reason: 'active' };
}

export function cancellationDecision(previous: CancellationState, incoming: FlightDisruptionState, nowUtc: number, confirmationMinutes = 30): CancellationDecision {
  const delay = Math.max(1, confirmationMinutes) * MINUTE;
  if (incoming === 'cancelled') {
    if (previous.confirmedAt) return { ...previous, recoverySignals: 0, recoveryFirstReportedAt: undefined, effectiveDisruption: 'cancelled' };
    const signals = previous.signals + 1;
    const firstReportedAt = previous.firstReportedAt ?? nowUtc;
    const confirmed = signals >= 2 && nowUtc - firstReportedAt >= delay;
    return {
      signals,
      firstReportedAt,
      confirmedAt: confirmed ? nowUtc : undefined,
      recoverySignals: 0,
      recoveryFirstReportedAt: undefined,
      effectiveDisruption: 'cancelled',
      event: confirmed ? 'flight_cancelled_confirmed' : previous.signals === 0 ? 'flight_cancelled_reported' : undefined,
    };
  }
  if (!previous.confirmedAt) {
    return {
      signals: 0,
      firstReportedAt: undefined,
      confirmedAt: undefined,
      recoverySignals: 0,
      recoveryFirstReportedAt: undefined,
      effectiveDisruption: incoming,
      event: previous.signals > 0 ? 'flight_cancellation_cleared' : undefined,
    };
  }
  const recoverySignals = previous.recoverySignals + 1;
  const recoveryFirstReportedAt = previous.recoveryFirstReportedAt ?? nowUtc;
  const cleared = recoverySignals >= 2 && nowUtc - recoveryFirstReportedAt >= delay;
  return {
    signals: cleared ? 0 : previous.signals,
    firstReportedAt: cleared ? undefined : previous.firstReportedAt,
    confirmedAt: cleared ? undefined : previous.confirmedAt,
    recoverySignals: cleared ? 0 : recoverySignals,
    recoveryFirstReportedAt: cleared ? undefined : recoveryFirstReportedAt,
    effectiveDisruption: cleared ? incoming : 'cancelled',
    event: cleared ? 'flight_cancellation_cleared' : recoverySignals === 1 ? 'flight_cancellation_cleared_reported' : undefined,
  };
}

export function normalizedStatusFingerprint(status: FlightStatus): string {
  return JSON.stringify({
    providerFlightId: status.providerFlightId ?? null,
    matchStatus: status.matchStatus ?? null,
    operationalPhase: status.operationalPhase ?? null,
    disruptionState: status.disruptionState ?? null,
    scheduledDepartureUtc: status.scheduledDepartureUtc ?? null,
    scheduledArrivalUtc: status.scheduledArrivalUtc ?? null,
    estimatedDepartureUtc: status.estimatedDepartureUtc ?? null,
    estimatedArrivalUtc: status.estimatedArrivalUtc ?? null,
    actualDepartureUtc: status.actualDepartureUtc ?? null,
    actualArrivalUtc: status.actualArrivalUtc ?? null,
    departureTerminal: status.departureTerminal ?? null,
    departureGate: status.departureGate ?? null,
    arrivalTerminal: status.arrivalTerminal ?? null,
    arrivalGate: status.arrivalGate ?? null,
    baggageBelt: status.baggageBelt ?? null,
    marketingAirlineCode: status.marketingAirlineCode ?? null,
    marketingFlightNumber: status.marketingFlightNumber ?? null,
    operatingAirlineCode: status.operatingAirlineCode ?? null,
    operatingFlightNumber: status.operatingFlightNumber ?? null,
    providerStatus: status.providerStatus ?? null,
  });
}

export function delayMinutes(status: FlightStatus): number | undefined {
  const scheduled = status.scheduledDepartureUtc;
  const current = status.actualDepartureUtc ?? status.estimatedDepartureUtc;
  if (scheduled == null || current == null || current <= scheduled) return undefined;
  return Math.max(1, Math.round((current - scheduled) / MINUTE));
}

export function meaningfulLiveEvents(previous: FlightStatus | undefined, next: FlightStatus, cancellationEvent?: CancellationDecision['event']): string[] {
  const events = new Set<string>();
  if (cancellationEvent) events.add(cancellationEvent);
  if (!previous) events.add('flight_status_updated');
  if (previous?.departureGate && next.departureGate && previous.departureGate !== next.departureGate) events.add('flight_gate_changed');
  if (previous?.departureTerminal && next.departureTerminal && previous.departureTerminal !== next.departureTerminal) events.add('flight_terminal_changed');
  const oldDelay = delayMinutes(previous ?? {} as FlightStatus);
  const newDelay = delayMinutes(next);
  if (newDelay != null && oldDelay == null) events.add('flight_delayed');
  else if (newDelay != null && oldDelay !== newDelay) events.add('flight_delay_changed');
  if (previous?.operationalPhase !== next.operationalPhase) {
    if (next.operationalPhase === 'departed' || next.operationalPhase === 'en_route') events.add('flight_departed');
    if (next.operationalPhase === 'landed') events.add('flight_landed');
  }
  if (previous?.disruptionState !== next.disruptionState && next.disruptionState === 'diverted') events.add('flight_diverted');
  return [...events];
}

export function mergeProviderFields(previous: FlightStatus | undefined, incoming: FlightStatus): FlightStatus {
  return {
    ...incoming,
    scheduledDepartureUtc: incoming.scheduledDepartureUtc ?? previous?.scheduledDepartureUtc,
    scheduledArrivalUtc: incoming.scheduledArrivalUtc ?? previous?.scheduledArrivalUtc,
    estimatedDepartureUtc: incoming.estimatedDepartureUtc ?? previous?.estimatedDepartureUtc,
    estimatedArrivalUtc: incoming.estimatedArrivalUtc ?? previous?.estimatedArrivalUtc,
    actualDepartureUtc: incoming.actualDepartureUtc ?? previous?.actualDepartureUtc,
    actualArrivalUtc: incoming.actualArrivalUtc ?? previous?.actualArrivalUtc,
    departureTerminal: incoming.departureTerminal ?? previous?.departureTerminal,
    departureGate: incoming.departureGate ?? previous?.departureGate,
    arrivalTerminal: incoming.arrivalTerminal ?? previous?.arrivalTerminal,
    arrivalGate: incoming.arrivalGate ?? previous?.arrivalGate,
    baggageBelt: incoming.baggageBelt ?? previous?.baggageBelt,
    marketingAirlineCode: incoming.marketingAirlineCode ?? previous?.marketingAirlineCode,
    marketingFlightNumber: incoming.marketingFlightNumber ?? previous?.marketingFlightNumber,
    operatingAirlineCode: incoming.operatingAirlineCode ?? previous?.operatingAirlineCode,
    operatingFlightNumber: incoming.operatingFlightNumber ?? previous?.operatingFlightNumber,
  };
}
