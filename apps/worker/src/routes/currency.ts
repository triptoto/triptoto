import type { Env } from '../types.ts';
import { HttpError, json } from '../http.ts';

const FRANKFURTER_RATES = 'https://api.frankfurter.dev/v2/rates';
const FALLBACK_LATEST = 'https://open.er-api.com/v6/latest';
const EDGE_TTL_SECONDS = 4 * 60 * 60;
const CODE = /^[A-Z]{3}$/;

const SOURCE_FRANKFURTER = 'Frankfurter · institutional reference rates';
const SOURCE_FALLBACK = 'ExchangeRate-API · daily rates';
const SOURCE_MIXED = 'Frankfurter + ExchangeRate-API';

function currencyCode(raw: string | null, name: string): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!CODE.test(value)) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a three-letter currency code.`);
  return value;
}

type PartialRates = { rates: Record<string, number>; date: string | null };

// ECB reference rates (Frankfurter). Excellent coverage but omits some currencies
// (notably RUB, dropped by the ECB on 2022-03-01). Never throws; returns whatever it can.
async function fetchFrankfurter(base: string, quotes: string[]): Promise<PartialRates> {
  const out: PartialRates = { rates: {}, date: null };
  try {
    const upstream = new URL(FRANKFURTER_RATES);
    upstream.searchParams.set('base', base);
    upstream.searchParams.set('quotes', quotes.join(','));
    const response = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: EDGE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return out;
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const value = row as { quote?: unknown; rate?: unknown; date?: unknown };
      const quote = String(value.quote || '').toUpperCase();
      const rate = Number(value.rate);
      if (!quotes.includes(quote) || !Number.isFinite(rate) || rate <= 0) continue;
      out.rates[quote] = rate;
      if (typeof value.date === 'string') out.date = value.date;
    }
  } catch (_error) { /* fall through to fallback provider */ }
  return out;
}

// Daily rates covering currencies the ECB set omits (RUB and more). No API key.
// Fills gaps only; never throws.
async function fetchFallback(base: string, quotes: string[]): Promise<PartialRates> {
  const out: PartialRates = { rates: {}, date: null };
  try {
    const response = await fetch(`${FALLBACK_LATEST}/${encodeURIComponent(base)}`, {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: EDGE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return out;
    const payload = await response.json() as { result?: unknown; rates?: unknown; time_last_update_utc?: unknown };
    if (payload?.result !== 'success' || !payload.rates || typeof payload.rates !== 'object') return out;
    const table = payload.rates as Record<string, unknown>;
    for (const quote of quotes) {
      const rate = Number(table[quote]);
      if (Number.isFinite(rate) && rate > 0) out.rates[quote] = rate;
    }
    if (typeof payload.time_last_update_utc === 'string') {
      const parsed = new Date(payload.time_last_update_utc);
      if (!Number.isNaN(parsed.getTime())) out.date = parsed.toISOString().slice(0, 10);
    }
  } catch (_error) { /* leave gaps unresolved */ }
  return out;
}

export async function currencyRates(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const base = currencyCode(url.searchParams.get('base'), 'base');
  const quotes = [...new Set(String(url.searchParams.get('quotes') || '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean))];
  if (!quotes.length || quotes.length > 8 || quotes.some((value) => !CODE.test(value) || value === base)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'quotes must contain 1-8 different three-letter currency codes.');
  }

  const primary = await fetchFrankfurter(base, quotes);
  const rates: Record<string, number> = { ...primary.rates };
  let date = primary.date;
  let usedFallback = false;

  const missing = quotes.filter((quote) => !Number.isFinite(rates[quote]));
  if (missing.length) {
    const fallback = await fetchFallback(base, missing);
    for (const quote of missing) {
      if (Number.isFinite(fallback.rates[quote])) {
        rates[quote] = fallback.rates[quote];
        usedFallback = true;
      }
    }
    if (!date && fallback.date) date = fallback.date;
  }

  if (!quotes.every((quote) => Number.isFinite(rates[quote]))) {
    throw new HttpError(502, 'CURRENCY_RATES_UNAVAILABLE', 'Exchange rates are temporarily unavailable.');
  }

  const usedPrimary = Object.keys(primary.rates).length > 0;
  const source = usedFallback ? (usedPrimary ? SOURCE_MIXED : SOURCE_FALLBACK) : SOURCE_FRANKFURTER;

  return json({
    currency: {
      base,
      rates,
      date,
      fetchedAt: Date.now(),
      source,
    },
  }, {}, request, env);
}
