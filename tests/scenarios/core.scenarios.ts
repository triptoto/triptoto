function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}
import { assessConnection } from '../../packages/impact-engine/src/index.ts';
import { evaluateTrip } from '../../packages/trip-brain/src/index.ts';

const hour = 60 * 60 * 1000;
const base = Date.UTC(2027, 4, 10, 10, 0, 0);

{
  const result = evaluateTrip({
    nowUtc: base,
    leaveBufferMinutes: 10,
    items: [{ id:'museum', tripId:'t1', type:'activity', status:'confirmed', title:'Museum', startsAtUtc: base + hour, confidence:'confirmed' }],
    travelDurationsByItemId: { museum: { minutes: 30, source:'cached_route', calculatedAt:base } }
  });
  assertEqual(result.recommendedLeaveAtUtc, base + 20 * 60_000, 'time-to-leave');
}

{
  const from = { id:'flight', tripId:'t1', type:'transport' as const, status:'confirmed' as const, title:'Flight', endsAtUtc: base, confidence:'confirmed' as const };
  const to = { id:'train', tripId:'t1', type:'transport' as const, status:'confirmed' as const, title:'Train', startsAtUtc: base + 45*60_000, confidence:'confirmed' as const };
  const assessment = assessConnection(from, to, { id:'c1', fromItemId:'flight', toItemId:'train', type:'self_transfer', recommendedBufferMinutes:90 });
  assertEqual(assessment.outcome, 'unlikely', 'self-transfer assessment');
}
