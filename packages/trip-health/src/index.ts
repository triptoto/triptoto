import type { Confidence, Severity, TripItem } from '../../domain/src/index.ts';
import { assessConnection } from '../../impact-engine/src/index.ts';

export type HealthCategory = 'timing' | 'timezone' | 'connection' | 'preparation' | 'booking' | 'lifecycle' | 'traveler';

export interface HealthConnection {
  id: string;
  fromItemId: string;
  toItemId: string;
  connectionType: 'protected' | 'self_transfer' | 'planned_transfer' | 'logical' | 'unknown';
  recommendedBufferMinutes?: number;
  minimumBufferMinutes?: number;
  requiresAirportChange?: boolean;
  requiresBaggageReclaim?: boolean;
  requiresImmigration?: boolean;
  requiresSecurity?: boolean;
  requiresTerminalChange?: boolean;
}

export interface HealthTrip {
  id: string;
  lifecycleState: 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
  startsOn?: string;
  endsOn?: string;
}

export interface HealthChecklistItem {
  id: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  completedAt?: number;
}

export interface HealthIssue {
  code: string;
  severity: Severity;
  priority: number;
  category: HealthCategory;
  confidence: Confidence;
  title: string;
  explanation: string;
  suggestedAction?: string;
  itemIds?: string[];
}

export interface HealthInput {
  nowUtc: number;
  trip: HealthTrip;
  items: TripItem[];
  connections?: HealthConnection[];
  checklist?: HealthChecklistItem[];
  travelerCount?: number;
  stayCount?: number;
  transportCount?: number;
}

const severityRank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function assessTripHealth(input: HealthInput): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const activeItems = input.items
    .filter(item => !item.deletedAt && !['cancelled', 'skipped'].includes(item.status))
    .sort((a, b) => (a.startsAtUtc ?? Number.MAX_SAFE_INTEGER) - (b.startsAtUtc ?? Number.MAX_SAFE_INTEGER));

  for (const item of input.items) {
    if (!item.deletedAt && item.status === 'cancelled' && item.startsAtUtc != null && item.startsAtUtc > input.nowUtc) {
      issues.push(issue('FUTURE_BOOKING_CANCELLED', 'high', 15, 'booking', 'confirmed', 'Upcoming booking is cancelled', `${item.title} is marked cancelled.`, 'Review alternatives and later plans.', [item.id]));
    }
  }

  for (let i = 1; i < activeItems.length; i++) {
    const previous = activeItems[i - 1];
    const current = activeItems[i];
    if (previous.endsAtUtc != null && current.startsAtUtc != null && current.startsAtUtc < previous.endsAtUtc) {
      issues.push(issue('TIMELINE_OVERLAP', 'high', 10, 'timing', 'confirmed', 'Plans overlap', `${previous.title} ends after ${current.title} starts.`, 'Review the times or move one plan.', [previous.id, current.id]));
    }
  }

  for (const item of activeItems) {
    if (item.startsAtUtc != null && !item.startTimezone) {
      issues.push(issue('START_TIMEZONE_MISSING', 'medium', 30, 'timezone', 'confirmed', 'Timezone missing', `${item.title} has a UTC time but no event-local timezone.`, 'Confirm the local timezone before travel.', [item.id]));
    }
    if (item.endsAtUtc != null && !item.endTimezone && item.type === 'transport') {
      issues.push(issue('END_TIMEZONE_MISSING', 'medium', 31, 'timezone', 'confirmed', 'Arrival timezone missing', `${item.title} has no arrival timezone.`, 'Confirm the destination timezone.', [item.id]));
    }
    if (item.confidence === 'low_confidence') {
      issues.push(issue('LOW_CONFIDENCE_BOOKING', 'high', 20, 'booking', 'low_confidence', 'Booking needs confirmation', `${item.title} contains low-confidence data.`, 'Open the booking and confirm every important field.', [item.id]));
    }
  }

  const byId = new Map(input.items.map(item => [item.id, item]));
  for (const connection of input.connections ?? []) {
    const from = byId.get(connection.fromItemId);
    const to = byId.get(connection.toItemId);
    if (!from || !to) {
      issues.push(issue('CONNECTION_TIME_UNAVAILABLE', 'info', 80, 'connection', 'unavailable', 'Connection cannot be assessed', 'One or both connection times are unavailable.', 'Confirm both segment times.', [connection.fromItemId, connection.toItemId]));
      continue;
    }
    const assessment=assessConnection(from,to,{...connection,type:connection.connectionType});
    if (assessment.explanationCode==='MISSING_TIMES') {
      issues.push(issue('CONNECTION_TIME_UNAVAILABLE', 'info', 80, 'connection', 'unavailable', 'Connection cannot be assessed', 'One or both connection times are unavailable.', 'Confirm both segment times.', [connection.fromItemId, connection.toItemId]));
      continue;
    }
    if (assessment.explanationCode==='BUFFER_UNKNOWN') {
      issues.push(issue('CONNECTION_BUFFER_UNAVAILABLE', 'medium', 26, 'connection', 'unavailable', 'Connection buffer is unavailable', 'No reliable minimum or recommended connection buffer is recorded.', 'Confirm the connection requirements; no safety assumption was made.', [from.id, to.id]));
      continue;
    }
    const available=assessment.availableMinutes!;
    const required=assessment.requiredMinutes!;
    const margin=assessment.bufferMinutes!;
    if (assessment.explanationCode==='AIRPORT_CHANGE_TOO_TIGHT') issues.push(issue('AIRPORT_CHANGE_RISK', 'critical', 2, 'connection', 'estimated', 'Airport change may be too tight', `Only ${available} minutes are available; at least ${required} are recommended and airport changes under 180 minutes require review.`, 'Use a much larger buffer or change the itinerary.', [from.id, to.id]));
    else if (assessment.outcome==='unlikely') issues.push(issue('CONNECTION_UNLIKELY', 'critical', 1, 'connection', 'estimated', 'Connection is unlikely', `Only ${available} minutes are available; at least ${required} are recommended.`, 'Change the itinerary or add a larger buffer.', [from.id, to.id]));
    else if (assessment.explanationCode==='SELF_TRANSFER_REVIEW') issues.push(issue('SELF_TRANSFER_REVIEW', 'medium', 25, 'connection', 'estimated', 'Self-transfer needs review', `This self-transfer has ${available} minutes between segments.`, 'Confirm baggage reclaim, immigration, security and check-in deadlines.', [from.id, to.id]));
    else if (assessment.outcome==='tight') issues.push(issue('CONNECTION_TIGHT', 'high', 5, 'connection', 'estimated', 'Connection is tight', `The connection has only ${margin} minutes above the recommended buffer.`, 'Review terminals, baggage, security and immigration requirements.', [from.id, to.id]));
  }

  const criticalChecklist = (input.checklist ?? []).filter(item => !item.completedAt && item.priority === 'critical');
  const highChecklist = (input.checklist ?? []).filter(item => !item.completedAt && item.priority === 'high');
  if (criticalChecklist.length) issues.push(issue('CRITICAL_ESSENTIALS_OPEN', 'critical', 3, 'preparation', 'confirmed', 'Critical travel essentials remain', `${criticalChecklist.length} critical checklist item(s) are still open.`, 'Complete the critical items before departure.', criticalChecklist.map(i => i.id)));
  if (highChecklist.length) issues.push(issue('HIGH_ESSENTIALS_OPEN', 'high', 18, 'preparation', 'confirmed', 'Important travel essentials remain', `${highChecklist.length} high-priority checklist item(s) are still open.`, 'Complete the important items before departure.', highChecklist.map(i => i.id)));

  const preparationRelevant = ['draft', 'upcoming', 'active'].includes(input.trip.lifecycleState);
  if ((input.travelerCount ?? 0) === 0 && preparationRelevant) issues.push(issue('NO_TRAVELERS', 'medium', 40, 'traveler', 'confirmed', 'No travelers added', 'The trip has no traveler records.', 'Add each traveler so documents and bookings can be assigned.'));
  const tripDays = dateSpan(input.trip.startsOn, input.trip.endsOn);
  if ((input.transportCount ?? 0) === 0 && ['upcoming', 'active'].includes(input.trip.lifecycleState)) issues.push(issue('NO_TRANSPORT', 'medium', 42, 'preparation', 'confirmed', 'No transport added', 'This trip has no active transport booking.', 'Add a flight, train, car, ferry or transfer.'));
  if (tripDays != null && tripDays >= 1 && (input.stayCount ?? 0) === 0 && ['upcoming', 'active'].includes(input.trip.lifecycleState)) issues.push(issue('NO_STAY', 'medium', 43, 'preparation', 'confirmed', 'No stay added', 'A multi-day trip has no active hotel or stay.', 'Add the accommodation or confirm that none is needed.'));

  if (input.trip.startsOn && input.trip.endsOn && input.trip.endsOn < input.trip.startsOn) issues.push(issue('TRIP_DATE_ORDER_INVALID', 'critical', 0, 'lifecycle', 'confirmed', 'Trip dates are invalid', 'The trip end date is before the start date.', 'Correct the trip dates.'));
  if (input.trip.lifecycleState === 'active' && !activeItems.some(item => item.startsAtUtc != null && item.startsAtUtc >= input.nowUtc)) issues.push(issue('ACTIVE_TRIP_NO_NEXT_PLAN', 'medium', 35, 'lifecycle', 'confirmed', 'No upcoming plan', 'The trip is active but has no upcoming timeline item.', 'Add the next plan or mark the trip completed.'));

  return dedupe(issues).sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || a.priority - b.priority || a.code.localeCompare(b.code));
}

export function highestSeverity(issues: HealthIssue[]): Severity {
  if (!issues.length) return 'info';
  return [...issues].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])[0].severity;
}

function issue(code: string, severity: Severity, priority: number, category: HealthCategory, confidence: Confidence, title: string, explanation: string, suggestedAction?: string, itemIds?: string[]): HealthIssue {
  return { code, severity, priority, category, confidence, title, explanation, suggestedAction, itemIds };
}

function dateSpan(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  return Math.round((endMs - startMs) / 86400000);
}

function dedupe(issues: HealthIssue[]): HealthIssue[] {
  const seen = new Set<string>();
  return issues.filter(issue => {
    const key = `${issue.code}:${(issue.itemIds ?? []).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
