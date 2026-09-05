import { AeroDataBoxFlightProvider, FlightProviderRequestError } from '../../../packages/providers/src/aerodatabox.ts';
import { DisabledFlightProvider, type FlightLookup, type FlightProvider, type FlightStatus } from '../../../packages/providers/src/index.ts';
import { assessLiveFlightImpact } from '../../../packages/impact-engine/src/index.ts';
import {
  cancellationDecision,
  delayMinutes,
  meaningfulLiveEvents,
  mergeProviderFields,
  normalizedStatusFingerprint,
  refreshPolicy,
} from '../../../packages/live-flights/src/index.ts';
import type { AuthContext, D1PreparedStatement, Env } from './types.ts';
import { nowMs, uuid } from './http.ts';

const PROVIDER = 'aerodatabox';
const REQUEST_TYPE = 'flight_status_by_number_and_departure_date';
const PROVIDER_UNIT_COST = 2;

export interface LiveFlightConfig {
  enabled: boolean;
  provider: string;
  configured: boolean;
  dailyBudget: number;
  monthlyBudget: number;
  minRefreshMinutes: number;
  maxBatchSize: number;
  betaOnly: boolean;
  betaUserIds: Set<string>;
  timeoutMs: number;
  host: string;
}

export interface LiveFlightFeatureStatus {
  enabled: boolean;
  available: boolean;
  provider?: string;
  betaOnly: boolean;
  reason?: 'disabled' | 'provider_unavailable' | 'credentials_missing' | 'beta_restricted';
}

export interface LiveFlightRefreshResult {
  itemId: string;
  outcome: 'updated' | 'unchanged' | 'cached' | 'not_due' | 'disabled' | 'quota_exhausted' | 'unavailable' | 'error';
  providerCalled: boolean;
  status?: FlightStatus;
  message?: string;
}

interface DueFlightRow extends Record<string, unknown> {
  trip_item_id: string;
  trip_id: string;
  owner_user_id: string | null;
  scheduled_departure_utc: number;
  scheduled_arrival_utc: number | null;
  departure_timezone: string | null;
  marketing_airline_code: string | null;
  marketing_flight_number: string | null;
  operating_airline_code: string | null;
  operating_flight_number: string | null;
  service_number: string | null;
  departure_iata: string | null;
  arrival_iata: string | null;
  operational_phase: string;
  disruption_state: string;
  live_data_enabled: number;
  provider: string | null;
  provider_flight_id: string | null;
  match_status: string | null;
  match_confidence: number | null;
  provider_status: string | null;
  provider_scheduled_departure_utc: number | null;
  provider_scheduled_arrival_utc: number | null;
  estimated_departure_utc: number | null;
  estimated_arrival_utc: number | null;
  actual_departure_utc: number | null;
  actual_arrival_utc: number | null;
  live_departure_terminal: string | null;
  live_departure_gate: string | null;
  live_arrival_terminal: string | null;
  live_arrival_gate: string | null;
  baggage_belt: string | null;
  live_marketing_airline_code: string | null;
  live_marketing_flight_number: string | null;
  live_operating_airline_code: string | null;
  live_operating_flight_number: string | null;
  provider_updated_at: number | null;
  fetched_at: number | null;
  last_checked_at: number | null;
  last_success_at: number | null;
  freshness_expires_at: number | null;
  next_refresh_at: number | null;
  normalized_fingerprint: string | null;
  backoff_until: number | null;
  cancellation_signals: number | null;
  cancellation_first_reported_at: number | null;
  cancellation_confirmed_at: number | null;
  cancellation_recovery_signals: number | null;
  cancellation_recovery_first_reported_at: number | null;
}

export function liveFlightConfig(env: Env): LiveFlightConfig {
  const provider = (env.LIVE_FLIGHT_PROVIDER || PROVIDER).trim().toLowerCase();
  const enabled = env.LIVE_FLIGHTS_ENABLED === 'true';
  const hasKey = Boolean(env.AERODATABOX_RAPIDAPI_KEY?.trim());
  return {
    enabled,
    provider,
    configured: enabled && provider === PROVIDER && hasKey,
    dailyBudget: boundedEnvInteger(env.LIVE_FLIGHT_DAILY_REQUEST_BUDGET, 8, 1, 100),
    monthlyBudget: boundedEnvInteger(env.LIVE_FLIGHT_MONTHLY_REQUEST_BUDGET, 240, 1, 10_000),
    minRefreshMinutes: boundedEnvInteger(env.LIVE_FLIGHT_MIN_REFRESH_MINUTES, 60, 30, 24 * 60),
    maxBatchSize: boundedEnvInteger(env.LIVE_FLIGHT_MAX_BATCH_SIZE, 2, 1, 10),
    betaOnly: env.LIVE_FLIGHT_BETA_ONLY !== 'false',
    betaUserIds: new Set((env.LIVE_FLIGHT_BETA_USER_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean)),
    timeoutMs: boundedEnvInteger(env.AERODATABOX_API_TIMEOUT_MS, 7_000, 1_000, 15_000),
    host: (env.AERODATABOX_RAPIDAPI_HOST || 'aerodatabox.p.rapidapi.com').trim(),
  };
}

export function liveFlightFeatureStatus(env: Env, auth?: AuthContext): LiveFlightFeatureStatus {
  const config = liveFlightConfig(env);
  if (!config.enabled) return { enabled: false, available: false, betaOnly: config.betaOnly, reason: 'disabled' };
  if (config.provider !== PROVIDER) return { enabled: true, available: false, provider: config.provider, betaOnly: config.betaOnly, reason: 'provider_unavailable' };
  if (!env.AERODATABOX_RAPIDAPI_KEY?.trim()) return { enabled: true, available: false, provider: config.provider, betaOnly: config.betaOnly, reason: 'credentials_missing' };
  if (!isEligibleUser(config, auth?.userId)) return { enabled: true, available: false, provider: config.provider, betaOnly: config.betaOnly, reason: 'beta_restricted' };
  return { enabled: true, available: true, provider: config.provider, betaOnly: config.betaOnly };
}

export function createFlightProvider(env: Env): FlightProvider {
  const config = liveFlightConfig(env);
  if (!config.configured) return new DisabledFlightProvider();
  return new AeroDataBoxFlightProvider({
    apiKey: env.AERODATABOX_RAPIDAPI_KEY ?? '',
    host: config.host,
    timeoutMs: config.timeoutMs,
  });
}

export async function runScheduledLiveFlightRefresh(env: Env, dependencies: { provider?: FlightProvider; now?: number } = {}): Promise<{ enabled: boolean; examined: number; refreshed: number; providerCalls: number; results: LiveFlightRefreshResult[] }> {
  const config = liveFlightConfig(env);
  if (!config.configured) {
    await updateIntegrationHealth(env, config, 'disabled', undefined, 'LIVE_FLIGHTS_DISABLED');
    return { enabled: false, examined: 0, refreshed: 0, providerCalls: 0, results: [] };
  }
  const now = dependencies.now ?? nowMs();
  const candidates = (await env.DB.prepare(`${dueFlightSelect()}
    WHERE f.live_data_enabled=1 AND ti.deleted_at IS NULL
      AND ti.status NOT IN ('cancelled','skipped','completed')
      AND (fls.next_refresh_at IS NULL OR fls.next_refresh_at<=?)
      AND (fls.backoff_until IS NULL OR fls.backoff_until<=?)
    ORDER BY
      CASE WHEN fls.cancellation_confirmed_at IS NULL AND fls.cancellation_signals>0 THEN 0
           WHEN f.operational_phase='boarding' OR (f.operational_phase='scheduled' AND f.scheduled_departure_utc BETWEEN ? AND ?+10800000) THEN 1
           WHEN f.disruption_state='delayed' THEN 2
           WHEN f.operational_phase IN ('departed','en_route') THEN 3 ELSE 4 END,
      ABS(f.scheduled_departure_utc-?)
    LIMIT ?`).bind(now, now, now, now, now, Math.max(config.maxBatchSize * 8, config.maxBatchSize)).all<DueFlightRow>()).results ?? [];
  const eligible = candidates.filter(row => isEligibleUser(config, row.owner_user_id)).slice(0, config.maxBatchSize);
  const provider = dependencies.provider ?? createFlightProvider(env);
  const results: LiveFlightRefreshResult[] = [];
  for (const row of eligible) results.push(await refreshLiveFlightRow(env, row, provider, config, now, 'scheduled'));
  return {
    enabled: true,
    examined: candidates.length,
    refreshed: results.filter(result => ['updated', 'unchanged', 'cached'].includes(result.outcome)).length,
    providerCalls: results.filter(result => result.providerCalled).length,
    results,
  };
}

export async function refreshLiveFlightById(env: Env, auth: AuthContext, tripId: string, itemId: string, dependencies: { provider?: FlightProvider; now?: number } = {}): Promise<LiveFlightRefreshResult> {
  const feature = liveFlightFeatureStatus(env, auth);
  if (!feature.available) return { itemId, outcome: 'disabled', providerCalled: false, message: 'Live flight updates are unavailable.' };
  const row = await env.DB.prepare(`${dueFlightSelect()} WHERE ti.trip_id=? AND ti.id=? AND ti.deleted_at IS NULL`).bind(tripId, itemId).first<DueFlightRow>();
  if (!row || row.live_data_enabled !== 1) return { itemId, outcome: 'unavailable', providerCalled: false, message: 'Live updates are not enabled for this flight.' };
  const config = liveFlightConfig(env);
  return refreshLiveFlightRow(env, row, dependencies.provider ?? createFlightProvider(env), config, dependencies.now ?? nowMs(), 'manual');
}

export async function scheduleLiveFlightMonitoring(env: Env, auth: AuthContext, tripId: string, itemId: string, enabled: boolean, now = nowMs()): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(`SELECT ti.id,ti.trip_id,ti.status,f.live_data_enabled,f.scheduled_departure_utc,f.scheduled_arrival_utc,f.operational_phase,f.disruption_state FROM trip_items ti JOIN flights f ON f.trip_item_id=ti.id WHERE ti.trip_id=? AND ti.id=? AND ti.deleted_at IS NULL`).bind(tripId, itemId).first<Record<string, unknown>>();
  if (!row) return null;
  if (enabled && !liveFlightFeatureStatus(env, auth).available) throw new LiveFlightUnavailableError('Live flight updates are not available for this account.');
  const config = liveFlightConfig(env);
  const policy = refreshPolicy({
    nowUtc: now,
    scheduledDepartureUtc: Number(row.scheduled_departure_utc),
    scheduledArrivalUtc: nullableNumber(row.scheduled_arrival_utc) ?? undefined,
    operationalPhase: stringValue(row.operational_phase) as FlightStatus['operationalPhase'],
    disruptionState: stringValue(row.disruption_state) as FlightStatus['disruptionState'],
    minRefreshMinutes: config.minRefreshMinutes,
  });
  const nextRefreshAt = enabled ? (policy.eligibleNow ? now : policy.nextRefreshAt ?? null) : null;
  await env.DB.batch([
    env.DB.prepare(`UPDATE flights SET live_data_enabled=? WHERE trip_item_id=?`).bind(enabled ? 1 : 0, itemId),
    env.DB.prepare(`INSERT INTO flight_live_status(trip_item_id,provider,match_status,next_refresh_at,created_at,updated_at)
      VALUES (?,?,'unavailable',?,?,?)
      ON CONFLICT(trip_item_id) DO UPDATE SET provider=excluded.provider,next_refresh_at=excluded.next_refresh_at,last_error_code=NULL,backoff_until=NULL,updated_at=excluded.updated_at`).bind(itemId, config.provider, nextRefreshAt, now, now),
    changeEventStatement(env, tripId, itemId, enabled ? 'flight_live_enabled' : 'flight_live_disabled', null, { enabled }, config.provider, `toggle:${enabled}:${now}`),
  ]);
  return env.DB.prepare(`SELECT f.live_data_enabled,fls.* FROM flights f LEFT JOIN flight_live_status fls ON fls.trip_item_id=f.trip_item_id WHERE f.trip_item_id=?`).bind(itemId).first<Record<string, unknown>>();
}

export async function liveFlightUsageSummary(env: Env, at = nowMs()): Promise<Record<string, unknown>> {
  const config = liveFlightConfig(env);
  const { day, month } = utcBuckets(at);
  const row = await env.DB.prepare(`SELECT
    SUM(CASE WHEN day_bucket=? THEN 1 ELSE 0 END) used_today,
    SUM(CASE WHEN day_bucket=? THEN unit_cost ELSE 0 END) units_today,
    SUM(CASE WHEN month_bucket=? THEN 1 ELSE 0 END) used_month,
    SUM(CASE WHEN month_bucket=? THEN unit_cost ELSE 0 END) units_month,
    SUM(CASE WHEN month_bucket=? AND outcome='rate_limited' THEN 1 ELSE 0 END) rate_limited_month,
    SUM(CASE WHEN month_bucket=? AND outcome IN ('provider_error','timeout','invalid_response') THEN 1 ELSE 0 END) provider_errors_month
    FROM flight_provider_usage WHERE provider=?`).bind(day, day, month, month, month, month, config.provider).first<Record<string, unknown>>();
  const usedToday = Number(row?.used_today ?? 0), usedMonth = Number(row?.used_month ?? 0);
  return {
    provider: config.provider,
    enabled: config.enabled,
    usedToday,
    remainingToday: Math.max(0, config.dailyBudget - usedToday),
    dailyBudget: config.dailyBudget,
    usedMonth,
    remainingMonth: Math.max(0, config.monthlyBudget - usedMonth),
    monthlyBudget: config.monthlyBudget,
    unitsToday: Number(row?.units_today ?? 0),
    unitsMonth: Number(row?.units_month ?? 0),
    providerUnitCost: PROVIDER_UNIT_COST,
    rateLimitedMonth: Number(row?.rate_limited_month ?? 0),
    providerErrorsMonth: Number(row?.provider_errors_month ?? 0),
  };
}

async function refreshLiveFlightRow(env: Env, row: DueFlightRow, provider: FlightProvider, config: LiveFlightConfig, now: number, source: 'scheduled' | 'manual'): Promise<LiveFlightRefreshResult> {
  const lookup = flightLookup(row);
  if (!lookup) {
    await recordFlightError(env, row, config, now, 'LOOKUP_INCOMPLETE', 'unavailable');
    return { itemId: row.trip_item_id, outcome: 'unavailable', providerCalled: false, message: 'Flight identity is incomplete.' };
  }
  const policy = refreshPolicy({
    nowUtc: now,
    scheduledDepartureUtc: Number(row.scheduled_departure_utc),
    scheduledArrivalUtc: nullableNumber(row.scheduled_arrival_utc) ?? undefined,
    operationalPhase: normalizePhase(row.operational_phase),
    disruptionState: normalizeDisruption(row.disruption_state),
    cancellationConfirmed: Boolean(row.cancellation_confirmed_at),
    minRefreshMinutes: config.minRefreshMinutes,
  });
  if (!policy.eligibleNow) {
    await env.DB.prepare(`UPDATE flight_live_status SET next_refresh_at=?,updated_at=? WHERE trip_item_id=?`).bind(policy.nextRefreshAt ?? null, now, row.trip_item_id).run();
    return { itemId: row.trip_item_id, outcome: 'not_due', providerCalled: false };
  }
  if (row.backoff_until != null && Number(row.backoff_until) > now) return { itemId: row.trip_item_id, outcome: 'not_due', providerCalled: false };
  if (source === 'manual' && row.last_checked_at != null && now - Number(row.last_checked_at) < config.minRefreshMinutes * 60_000) {
    return { itemId: row.trip_item_id, outcome: 'not_due', providerCalled: false, message: 'Live status was checked recently.' };
  }
  const lookupKey = await lookupFingerprint(lookup);
  const cached = await readProviderCache(env, config.provider, lookupKey, now);
  if (cached) return applyFlightStatus(env, row, cached, config, now, true);
  const reservation = await reserveProviderRequest(env, config, now);
  if (!reservation) {
    await recordFlightError(env, row, config, now, 'QUOTA_EXHAUSTED', 'quota_exhausted');
    return { itemId: row.trip_item_id, outcome: 'quota_exhausted', providerCalled: false, message: 'Live flight updates are temporarily unavailable.' };
  }
  let status: FlightStatus;
  try {
    status = await provider.getStatus(lookup);
  } catch (error) {
    const detail = providerError(error);
    await completeUsage(env, reservation, detail.outcome, detail.status, detail.code, now);
    const backoff = now + (detail.retryAfterSeconds ?? (detail.outcome === 'rate_limited' ? 60 * 60 : 30 * 60)) * 1_000;
    await recordFlightError(env, row, config, now, detail.code, 'degraded', backoff);
    return { itemId: row.trip_item_id, outcome: 'error', providerCalled: true, message: 'Live flight updates are temporarily unavailable.' };
  }
  const outcome = status.available ? 'success' : status.reason === 'ambiguous' ? 'ambiguous' : 'not_found';
  await completeUsage(env, reservation, outcome, undefined, status.reason?.toUpperCase(), now);
  await writeProviderCache(env, config.provider, lookupKey, status, now, policy.freshnessMinutes ?? config.minRefreshMinutes);
  if (!status.available) {
    await recordUnavailableStatus(env, row, status, config, now, policy.nextRefreshAt);
    await updateIntegrationHealth(env, config, 'healthy', now);
    return { itemId: row.trip_item_id, outcome: 'unavailable', providerCalled: true, status, message: status.reason === 'ambiguous' ? 'Live match needs confirmation.' : 'Live status is unavailable.' };
  }
  return applyFlightStatus(env, row, status, config, now, false);
}

async function applyFlightStatus(env: Env, row: DueFlightRow, incoming: FlightStatus, config: LiveFlightConfig, now: number, fromCache: boolean): Promise<LiveFlightRefreshResult> {
  const previous = previousStatus(row);
  const merged = mergeProviderFields(previous, incoming);
  const priorCancellation = {
    signals: Number(row.cancellation_signals ?? 0),
    firstReportedAt: nullableNumber(row.cancellation_first_reported_at) ?? undefined,
    confirmedAt: nullableNumber(row.cancellation_confirmed_at) ?? undefined,
    recoverySignals: Number(row.cancellation_recovery_signals ?? 0),
    recoveryFirstReportedAt: nullableNumber(row.cancellation_recovery_first_reported_at) ?? undefined,
  };
  // A shared-cache hit is the same provider observation, not independent
  // evidence. Reusing it must never confirm or clear a cancellation.
  const cancellation = fromCache
    ? { ...priorCancellation, effectiveDisruption: priorCancellation.confirmedAt ? 'cancelled' as const : merged.disruptionState ?? 'unknown' as const }
    : cancellationDecision(priorCancellation, merged.disruptionState ?? 'unknown', now, 30);
  merged.disruptionState = cancellation.effectiveDisruption;
  const fingerprint = await digest(normalizedStatusFingerprint(merged));
  const changed = fingerprint !== row.normalized_fingerprint;
  const meaningfulChange = changed || Boolean(cancellation.event);
  const delay = delayMinutes(merged);
  const policy = refreshPolicy({
    nowUtc: now,
    scheduledDepartureUtc: Number(row.scheduled_departure_utc),
    scheduledArrivalUtc: nullableNumber(row.scheduled_arrival_utc) ?? merged.scheduledArrivalUtc,
    operationalPhase: merged.operationalPhase,
    disruptionState: merged.disruptionState,
    cancellationConfirmed: Boolean(cancellation.confirmedAt),
    minRefreshMinutes: config.minRefreshMinutes,
  });
  const freshnessExpiresAt = (incoming.fetchedAt ?? now) + (policy.freshnessMinutes ?? config.minRefreshMinutes) * 60_000;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`UPDATE flights SET estimated_departure_utc=?,estimated_arrival_utc=?,actual_departure_utc=?,actual_arrival_utc=?,operational_phase=?,disruption_state=? WHERE trip_item_id=?`).bind(
      merged.estimatedDepartureUtc ?? null, merged.estimatedArrivalUtc ?? null, merged.actualDepartureUtc ?? null, merged.actualArrivalUtc ?? null,
      merged.operationalPhase ?? 'unknown', merged.disruptionState ?? 'unknown', row.trip_item_id),
    env.DB.prepare(`INSERT INTO flight_live_status(
      trip_item_id,provider,provider_flight_id,match_status,match_confidence,provider_status,
      provider_scheduled_departure_utc,provider_scheduled_arrival_utc,live_departure_terminal,live_departure_gate,
      live_arrival_terminal,live_arrival_gate,baggage_belt,marketing_airline_code,marketing_flight_number,
      operating_airline_code,operating_flight_number,delay_minutes,provider_updated_at,fetched_at,last_checked_at,
      last_success_at,freshness_expires_at,next_refresh_at,normalized_fingerprint,last_error_code,backoff_until,
      cancellation_signals,cancellation_first_reported_at,cancellation_confirmed_at,cancellation_recovery_signals,
      cancellation_recovery_first_reported_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,?,?,?,?,?,?,?)
    ON CONFLICT(trip_item_id) DO UPDATE SET
      provider=excluded.provider,provider_flight_id=excluded.provider_flight_id,match_status=excluded.match_status,
      match_confidence=excluded.match_confidence,provider_status=excluded.provider_status,
      provider_scheduled_departure_utc=excluded.provider_scheduled_departure_utc,provider_scheduled_arrival_utc=excluded.provider_scheduled_arrival_utc,
      live_departure_terminal=excluded.live_departure_terminal,live_departure_gate=excluded.live_departure_gate,
      live_arrival_terminal=excluded.live_arrival_terminal,live_arrival_gate=excluded.live_arrival_gate,baggage_belt=excluded.baggage_belt,
      marketing_airline_code=excluded.marketing_airline_code,marketing_flight_number=excluded.marketing_flight_number,
      operating_airline_code=excluded.operating_airline_code,operating_flight_number=excluded.operating_flight_number,
      delay_minutes=excluded.delay_minutes,provider_updated_at=excluded.provider_updated_at,fetched_at=excluded.fetched_at,
      last_checked_at=excluded.last_checked_at,last_success_at=excluded.last_success_at,freshness_expires_at=excluded.freshness_expires_at,
      next_refresh_at=excluded.next_refresh_at,normalized_fingerprint=excluded.normalized_fingerprint,last_error_code=NULL,backoff_until=NULL,
      cancellation_signals=excluded.cancellation_signals,cancellation_first_reported_at=excluded.cancellation_first_reported_at,
      cancellation_confirmed_at=excluded.cancellation_confirmed_at,cancellation_recovery_signals=excluded.cancellation_recovery_signals,
      cancellation_recovery_first_reported_at=excluded.cancellation_recovery_first_reported_at,updated_at=excluded.updated_at`).bind(
        row.trip_item_id, merged.provider ?? config.provider, merged.providerFlightId ?? null, merged.matchStatus ?? 'matched', merged.confidence ?? null, merged.providerStatus ?? null,
        merged.scheduledDepartureUtc ?? null, merged.scheduledArrivalUtc ?? null, merged.departureTerminal ?? null, merged.departureGate ?? null,
        merged.arrivalTerminal ?? null, merged.arrivalGate ?? null, merged.baggageBelt ?? null, merged.marketingAirlineCode ?? null,
        merged.marketingFlightNumber ?? null, merged.operatingAirlineCode ?? null, merged.operatingFlightNumber ?? null, delay ?? null,
        merged.providerUpdatedAt ?? null, incoming.fetchedAt ?? now, now, incoming.fetchedAt ?? now, freshnessExpiresAt,
        policy.nextRefreshAt ?? null, fingerprint, cancellation.signals, cancellation.firstReportedAt ?? null,
        cancellation.confirmedAt ?? null, cancellation.recoverySignals, cancellation.recoveryFirstReportedAt ?? null, row.fetched_at ? Number(row.fetched_at) : now, now),
  ];
  if (meaningfulChange) {
    const events = meaningfulLiveEvents(previous, merged, cancellation.event);
    for (const event of events) statements.push(changeEventStatement(env, row.trip_id, row.trip_item_id, event, previous, publicStatus(merged, cancellation.confirmedAt), config.provider, `${fingerprint}:${event}`));
    statements.push(env.DB.prepare(`UPDATE impact_assessments SET status='superseded' WHERE trip_id=? AND item_id=? AND impact_type IN ('time','status') AND status='active' AND explanation_code LIKE 'FLIGHT_%'`).bind(row.trip_id, row.trip_item_id));
    const assessment = assessLiveFlightImpact({ itemId: row.trip_item_id, disruptionState: merged.disruptionState ?? 'unknown', delayMinutes: delay, cancellationConfirmed: Boolean(cancellation.confirmedAt) });
    if (assessment) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO impact_assessments(id,trip_id,item_id,impact_type,severity,assessment_version,status,explanation_code,calculated_at) VALUES (?,?,?,?,?,1,'active',?,?)`).bind(`live-impact:${row.trip_item_id}:${fingerprint}:${assessment.explanationCode}`, row.trip_id, row.trip_item_id, assessment.impactType, assessment.severity, assessment.explanationCode, now));
  }
  await env.DB.batch(statements);
  await updateIntegrationHealth(env, config, 'healthy', now);
  return { itemId: row.trip_item_id, outcome: fromCache ? 'cached' : meaningfulChange ? 'updated' : 'unchanged', providerCalled: !fromCache, status: merged };
}

async function recordUnavailableStatus(env: Env, row: DueFlightRow, status: FlightStatus, config: LiveFlightConfig, now: number, nextRefreshAt?: number): Promise<void> {
  await env.DB.prepare(`INSERT INTO flight_live_status(trip_item_id,provider,match_status,last_checked_at,next_refresh_at,last_error_code,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(trip_item_id) DO UPDATE SET provider=excluded.provider,match_status=excluded.match_status,last_checked_at=excluded.last_checked_at,next_refresh_at=excluded.next_refresh_at,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at`)
    .bind(row.trip_item_id, config.provider, status.matchStatus ?? 'unavailable', now, nextRefreshAt ?? now + 6 * 60 * 60_000, (status.reason ?? 'unavailable').toUpperCase(), row.fetched_at ? Number(row.fetched_at) : now, now).run();
}

async function recordFlightError(env: Env, row: DueFlightRow, config: LiveFlightConfig, now: number, errorCode: string, health: 'unavailable' | 'degraded' | 'quota_exhausted', backoffUntil?: number): Promise<void> {
  const next = backoffUntil ?? now + Math.max(config.minRefreshMinutes, 60) * 60_000;
  await env.DB.prepare(`INSERT INTO flight_live_status(trip_item_id,provider,match_status,last_checked_at,next_refresh_at,last_error_code,backoff_until,created_at,updated_at)
    VALUES (?,?,'unavailable',?,?,?,?,?,?) ON CONFLICT(trip_item_id) DO UPDATE SET last_checked_at=excluded.last_checked_at,next_refresh_at=excluded.next_refresh_at,last_error_code=excluded.last_error_code,backoff_until=excluded.backoff_until,updated_at=excluded.updated_at`)
    .bind(row.trip_item_id, config.provider, now, next, errorCode, backoffUntil ?? null, row.fetched_at ? Number(row.fetched_at) : now, now).run();
  await updateIntegrationHealth(env, config, health, undefined, errorCode);
}

async function reserveProviderRequest(env: Env, config: LiveFlightConfig, now: number): Promise<string | null> {
  const id = uuid(), { day, month } = utcBuckets(now);
  await env.DB.prepare(`INSERT INTO flight_provider_usage(id,provider,request_type,day_bucket,month_bucket,unit_cost,outcome,created_at)
    SELECT ?,?,?,?,?,?,'reserved',?
    WHERE (SELECT COUNT(*) FROM flight_provider_usage WHERE provider=? AND day_bucket=?) < ?
      AND (SELECT COUNT(*) FROM flight_provider_usage WHERE provider=? AND month_bucket=?) < ?`)
    .bind(id, config.provider, REQUEST_TYPE, day, month, PROVIDER_UNIT_COST, now, config.provider, day, config.dailyBudget, config.provider, month, config.monthlyBudget).run();
  const claim = await env.DB.prepare(`SELECT id FROM flight_provider_usage WHERE id=?`).bind(id).first<{ id: string }>();
  if (!claim) {
    await updateIntegrationHealth(env, config, 'quota_exhausted', undefined, 'LOCAL_QUOTA_EXHAUSTED');
    return null;
  }
  return id;
}

async function completeUsage(env: Env, id: string, outcome: string, status: number | undefined, errorCode: string | undefined, now: number): Promise<void> {
  await env.DB.prepare(`UPDATE flight_provider_usage SET outcome=?,provider_status_code=?,error_code=?,completed_at=? WHERE id=? AND outcome='reserved'`).bind(outcome, status ?? null, errorCode ?? null, now, id).run();
}

async function readProviderCache(env: Env, provider: string, lookupKey: string, now: number): Promise<FlightStatus | null> {
  const row = await env.DB.prepare(`SELECT normalized_status_json FROM flight_provider_cache WHERE provider=? AND lookup_key=? AND expires_at>?`).bind(provider, lookupKey, now).first<{ normalized_status_json: string }>();
  if (!row) return null;
  try { return JSON.parse(row.normalized_status_json) as FlightStatus; } catch { return null; }
}

async function writeProviderCache(env: Env, provider: string, lookupKey: string, status: FlightStatus, now: number, freshnessMinutes: number): Promise<void> {
  const fingerprint = await digest(normalizedStatusFingerprint(status));
  await env.DB.prepare(`INSERT INTO flight_provider_cache(provider,lookup_key,normalized_status_json,normalized_fingerprint,fetched_at,expires_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(provider,lookup_key) DO UPDATE SET normalized_status_json=excluded.normalized_status_json,normalized_fingerprint=excluded.normalized_fingerprint,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at`)
    .bind(provider, lookupKey, JSON.stringify(status), fingerprint, now, now + Math.max(30, freshnessMinutes) * 60_000).run();
}

async function updateIntegrationHealth(env: Env, config: LiveFlightConfig, status: 'disabled' | 'healthy' | 'degraded' | 'unavailable' | 'quota_exhausted', successAt?: number, errorCode?: string): Promise<void> {
  const now = nowMs(), { month } = utcBuckets(now);
  const usage = await env.DB.prepare(`SELECT COUNT(*) count FROM flight_provider_usage WHERE provider=? AND month_bucket=?`).bind(config.provider, month).first<{ count: number }>();
  const failure = ['degraded', 'unavailable', 'quota_exhausted'].includes(status);
  await env.DB.prepare(`INSERT INTO integration_health(integration_type,provider_key,enabled,status,last_success_at,last_failure_at,consecutive_failures,quota_used,quota_limit,last_error_code,updated_at)
    VALUES ('flight',?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(integration_type,provider_key) DO UPDATE SET enabled=excluded.enabled,status=excluded.status,
      last_success_at=CASE WHEN excluded.last_success_at IS NOT NULL THEN excluded.last_success_at ELSE integration_health.last_success_at END,
      last_failure_at=CASE WHEN excluded.last_failure_at IS NOT NULL THEN excluded.last_failure_at ELSE integration_health.last_failure_at END,
      consecutive_failures=CASE WHEN excluded.status='healthy' THEN 0 WHEN excluded.status IN ('degraded','unavailable','quota_exhausted') THEN integration_health.consecutive_failures+1 ELSE integration_health.consecutive_failures END,
      quota_used=excluded.quota_used,quota_limit=excluded.quota_limit,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at`)
    .bind(config.provider, config.enabled ? 1 : 0, status, successAt ?? null, failure ? now : null, failure ? 1 : 0, Number(usage?.count ?? 0), config.monthlyBudget, errorCode ?? null, now).run();
}

function dueFlightSelect(): string {
  return `SELECT ti.id trip_item_id,ti.trip_id,t.owner_user_id,ti.status item_status,
    ts.service_number,ts.scheduled_departure_utc,ts.scheduled_arrival_utc,ts.departure_timezone,
    dl.iata_code departure_iata,al.iata_code arrival_iata,
    f.marketing_airline_code,f.marketing_flight_number,f.operating_airline_code,f.operating_flight_number,
    f.estimated_departure_utc,f.estimated_arrival_utc,f.actual_departure_utc,f.actual_arrival_utc,
    f.operational_phase,f.disruption_state,f.live_data_enabled,
    fls.provider,fls.provider_flight_id,fls.match_status,fls.match_confidence,fls.provider_status,
    fls.provider_scheduled_departure_utc,fls.provider_scheduled_arrival_utc,
    fls.live_departure_terminal,fls.live_departure_gate,fls.live_arrival_terminal,fls.live_arrival_gate,fls.baggage_belt,
    fls.marketing_airline_code live_marketing_airline_code,fls.marketing_flight_number live_marketing_flight_number,
    fls.operating_airline_code live_operating_airline_code,fls.operating_flight_number live_operating_flight_number,
    fls.provider_updated_at,fls.fetched_at,fls.last_checked_at,fls.last_success_at,fls.freshness_expires_at,
    fls.next_refresh_at,fls.normalized_fingerprint,fls.backoff_until,fls.cancellation_signals,
    fls.cancellation_first_reported_at,fls.cancellation_confirmed_at,fls.cancellation_recovery_signals,
    fls.cancellation_recovery_first_reported_at
    FROM trip_items ti JOIN trips t ON t.id=ti.trip_id JOIN transport_segments ts ON ts.trip_item_id=ti.id
    JOIN flights f ON f.trip_item_id=ti.id LEFT JOIN flight_live_status fls ON fls.trip_item_id=ti.id
    LEFT JOIN locations dl ON dl.id=ts.departure_location_id LEFT JOIN locations al ON al.id=ts.arrival_location_id`;
}

function flightLookup(row: DueFlightRow): FlightLookup | null {
  const flightNumber = row.marketing_flight_number || row.service_number || row.operating_flight_number;
  if (!flightNumber || !row.scheduled_departure_utc || !row.departure_timezone) return null;
  const departureDateLocal = dateInTimezone(Number(row.scheduled_departure_utc), row.departure_timezone);
  if (!departureDateLocal) return null;
  return {
    marketingCarrier: row.marketing_airline_code ?? undefined,
    flightNumber,
    operatingCarrier: row.operating_airline_code ?? undefined,
    operatingFlightNumber: row.operating_flight_number ?? undefined,
    departureDateLocal,
    departureAirport: row.departure_iata ?? undefined,
    arrivalAirport: row.arrival_iata ?? undefined,
  };
}

function previousStatus(row: DueFlightRow): FlightStatus | undefined {
  if (!row.normalized_fingerprint) return undefined;
  return {
    available: true,
    provider: row.provider ?? undefined,
    providerFlightId: row.provider_flight_id ?? undefined,
    matchStatus: row.match_status as FlightStatus['matchStatus'],
    confidence: nullableNumber(row.match_confidence) ?? undefined,
    providerStatus: row.provider_status ?? undefined,
    scheduledDepartureUtc: nullableNumber(row.provider_scheduled_departure_utc) ?? undefined,
    scheduledArrivalUtc: nullableNumber(row.provider_scheduled_arrival_utc) ?? undefined,
    estimatedDepartureUtc: nullableNumber(row.estimated_departure_utc) ?? undefined,
    estimatedArrivalUtc: nullableNumber(row.estimated_arrival_utc) ?? undefined,
    actualDepartureUtc: nullableNumber(row.actual_departure_utc) ?? undefined,
    actualArrivalUtc: nullableNumber(row.actual_arrival_utc) ?? undefined,
    departureTerminal: row.live_departure_terminal ?? undefined,
    departureGate: row.live_departure_gate ?? undefined,
    arrivalTerminal: row.live_arrival_terminal ?? undefined,
    arrivalGate: row.live_arrival_gate ?? undefined,
    baggageBelt: row.baggage_belt ?? undefined,
    marketingAirlineCode: row.live_marketing_airline_code ?? undefined,
    marketingFlightNumber: row.live_marketing_flight_number ?? undefined,
    operatingAirlineCode: row.live_operating_airline_code ?? undefined,
    operatingFlightNumber: row.live_operating_flight_number ?? undefined,
    operationalPhase: normalizePhase(row.operational_phase),
    disruptionState: normalizeDisruption(row.disruption_state),
    providerUpdatedAt: nullableNumber(row.provider_updated_at) ?? undefined,
    fetchedAt: nullableNumber(row.fetched_at) ?? undefined,
  };
}

function publicStatus(status: FlightStatus, cancellationConfirmedAt?: number): Record<string, unknown> {
  return {
    available: status.available,
    matchStatus: status.matchStatus,
    operationalPhase: status.operationalPhase,
    disruptionState: status.disruptionState,
    delayMinutes: delayMinutes(status),
    departureTerminal: status.departureTerminal,
    departureGate: status.departureGate,
    arrivalTerminal: status.arrivalTerminal,
    arrivalGate: status.arrivalGate,
    estimatedDepartureUtc: status.estimatedDepartureUtc,
    estimatedArrivalUtc: status.estimatedArrivalUtc,
    actualDepartureUtc: status.actualDepartureUtc,
    actualArrivalUtc: status.actualArrivalUtc,
    cancellationConfirmed: Boolean(cancellationConfirmedAt),
  };
}

function changeEventStatement(env: Env, tripId: string, itemId: string, eventType: string, oldValue: unknown, newValue: unknown, provider: string, dedupe: string): D1PreparedStatement {
  return env.DB.prepare(`INSERT OR IGNORE INTO change_events(id,trip_id,entity_type,entity_id,event_type,old_value_json,new_value_json,source_type,source_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .bind(`live:${itemId}:${eventType}:${dedupe}`.slice(0, 240), tripId, 'trip_item', itemId, eventType, oldValue == null ? null : JSON.stringify(oldValue), newValue == null ? null : JSON.stringify(newValue), 'provider', provider, nowMs());
}

function providerError(error: unknown): { outcome: 'rate_limited' | 'timeout' | 'provider_error' | 'invalid_response'; code: string; status?: number; retryAfterSeconds?: number } {
  if (error instanceof FlightProviderRequestError) return { outcome: error.category, code: `PROVIDER_${error.category.toUpperCase()}`, status: error.status, retryAfterSeconds: error.retryAfterSeconds };
  return { outcome: 'provider_error', code: 'PROVIDER_ERROR' };
}

function dateInTimezone(time: number, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(time));
    const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  } catch { return null; }
}

function normalizePhase(value: unknown): FlightStatus['operationalPhase'] { return ['scheduled','boarding','departed','en_route','landed','unknown'].includes(String(value)) ? value as FlightStatus['operationalPhase'] : 'unknown'; }
function normalizeDisruption(value: unknown): FlightStatus['disruptionState'] { return ['none','delayed','cancelled','diverted','unknown'].includes(String(value)) ? value as FlightStatus['disruptionState'] : 'unknown'; }
function isEligibleUser(config: LiveFlightConfig, userId?: string | null): boolean { return !config.betaOnly || Boolean(userId && config.betaUserIds.has(userId)); }
function boundedEnvInteger(value: string | undefined, fallback: number, min: number, max: number): number { const parsed = Number(value); return Number.isSafeInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback; }
function nullableNumber(value: unknown): number | null { if (value == null) return null; const number = Number(value); return Number.isFinite(number) ? number : null; }
function stringValue(value: unknown): string { return value == null ? '' : String(value); }
function utcBuckets(time: number): { day: string; month: string } { const iso = new Date(time).toISOString(); return { day: iso.slice(0, 10), month: iso.slice(0, 7) }; }
async function lookupFingerprint(lookup: FlightLookup): Promise<string> { return digest(JSON.stringify({ ...lookup, marketingCarrier: lookup.marketingCarrier?.toUpperCase(), flightNumber: lookup.flightNumber.toUpperCase(), operatingCarrier: lookup.operatingCarrier?.toUpperCase(), operatingFlightNumber: lookup.operatingFlightNumber?.toUpperCase(), departureAirport: lookup.departureAirport?.toUpperCase(), arrivalAirport: lookup.arrivalAirport?.toUpperCase() })); }
async function digest(value: string): Promise<string> { const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join(''); }

export class LiveFlightUnavailableError extends Error {}
