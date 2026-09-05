import type { Env } from '../../apps/worker/src/types.ts';
import { currencyRates } from '../../apps/worker/src/routes/currency.ts';

const assert = {
  equal(actual: unknown, expected: unknown, label: string) { if (actual !== expected) throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`); },
  match(actual: string, pattern: RegExp, label: string) { if (!pattern.test(actual)) throw new Error(`${label}: ${actual}`); },
};

const env = {} as Env;
const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://api.frankfurter.dev', 'provider origin');
    assert.equal(url.searchParams.get('base'), 'EUR', 'normalized base');
    assert.equal(url.searchParams.get('quotes'), 'ILS,USD', 'normalized quotes');
    return new Response(JSON.stringify([
      { date: '2026-09-03', base: 'EUR', quote: 'ILS', rate: 3.5118 },
      { date: '2026-09-03', base: 'EUR', quote: 'USD', rate: 1.1591 },
    ]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const response = await currencyRates(new Request('https://tripto.to/api/v1/currency?base=eur&quotes=ils,usd'), env);
  assert.equal(response.status, 200, 'response status');
  const payload = await response.json() as { currency: { base: string; rates: Record<string, number>; source: string } };
  assert.equal(payload.currency.base, 'EUR', 'response base');
  assert.equal(payload.currency.rates.ILS, 3.5118, 'ILS rate');
  assert.equal(payload.currency.rates.USD, 1.1591, 'USD rate');
  assert.match(payload.currency.source, /reference rates/i, 'source label');

  let invalidStatus = 0;
  try { await currencyRates(new Request('https://tripto.to/api/v1/currency?base=EU&quotes=USD'), env); }
  catch (error) { invalidStatus = Number((error as { status?: unknown })?.status || 0); }
  assert.equal(invalidStatus, 400, 'invalid code status');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('currency scenarios: ok');
