import type { TripItem, Severity, TravelDuration } from '../../domain/src/index.ts';

export interface TripBrainInput {
  nowUtc: number;
  items: TripItem[];
  travelDurationsByItemId?: Record<string, TravelDuration | undefined>;
  leaveBufferMinutes?: number;
}

export interface TripBrainIssue {
  code: string;
  severity: Severity;
  itemId?: string;
  message: string;
}

export interface TripBrainResult {
  nextItem?: TripItem;
  recommendedLeaveAtUtc?: number;
  recommendationConfidence: 'estimated' | 'unavailable';
  issues: TripBrainIssue[];
}

export function evaluateTrip(input: TripBrainInput): TripBrainResult {
  const active = input.items
    .filter(i => !i.deletedAt && !['cancelled', 'skipped'].includes(i.status) && i.startsAtUtc != null)
    .sort((a, b) => (a.startsAtUtc! - b.startsAtUtc!));

  const nextItem = active.find(i => i.startsAtUtc! >= input.nowUtc) ?? active.at(-1);
  if (!nextItem) return { recommendationConfidence: 'unavailable', issues: [] };

  const duration = input.travelDurationsByItemId?.[nextItem.id];
  if (!duration || duration.source === 'unknown' || nextItem.startsAtUtc == null) {
    return { nextItem, recommendationConfidence: 'unavailable', issues: [] };
  }

  const buffer = input.leaveBufferMinutes ?? 10;
  const leaveAt = nextItem.startsAtUtc - (duration.minutes + buffer) * 60_000;
  const issues: TripBrainIssue[] = [];
  if (leaveAt <= input.nowUtc && nextItem.startsAtUtc > input.nowUtc) {
    issues.push({ code: 'LEAVE_NOW', severity: 'high', itemId: nextItem.id, message: 'It may be time to leave for the next plan.' });
  }

  return { nextItem, recommendedLeaveAtUtc: leaveAt, recommendationConfidence: 'estimated', issues };
}
