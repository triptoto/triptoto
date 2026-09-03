import type { Env } from '../types.ts';
import { HttpError, json } from '../http.ts';

const FRANKFURTER_RATES = 'https://api.frankfurter.dev/v2/rates';
const EDGE_TTL_SECONDS = 4 * 60 * 60;
const CODE = /^[A-Z]{3}$/;

function currencyCode(raw: string | null, name: string): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!CODE.test(value)) throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a three-letter currency code.`);
  return value;
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

  const upstream = new URL(FRANKFURTER_RATES);
  upstream.searchParams.set('base', base);
  upstream.searchParams.set('quotes', quotes.join(','));

  let payload: unknown;
  try {
    const response = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: EDGE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    payload = await response.json();
  } catch (_error) {
    throw new HttpError(502, 'CURRENCY_RATES_UNAVAILABLE', 'Exchange rates are temporarily unavailable.');
  }

  const rows = Array.isArray(payload) ? payload : [];
  const rates: Record<string, number> = {};
  let date: string | null = null;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const value = row as { base?: unknown; quote?: unknown; rate?: unknown; date?: unknown };
    const quote = String(value.quote || '').toUpperCase();
    const rate = Number(value.rate);
    if (!quotes.includes(quote) || !Number.isFinite(rate) || rate <= 0) continue;
    rates[quote] = rate;
    if (typeof value.date === 'string') date = value.date;
  }
  if (!quotes.every((quote) => Number.isFinite(rates[quote]))) {
    throw new HttpError(502, 'CURRENCY_RATES_UNAVAILABLE', 'Exchange rates are temporarily unavailable.');
  }

  return json({
    currency: {
      base,
      rates,
      date,
      fetchedAt: Date.now(),
      source: 'Frankfurter · institutional reference rates',
    },
  }, {}, request, env);
}
