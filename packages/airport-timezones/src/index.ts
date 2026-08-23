import airportTimezones from '../data/iata-timezones.json';

const timezones = airportTimezones as Readonly<Record<string, string>>;

export function airportCodeFromInput(value: unknown): string | null {
  const match = String(value ?? '').trim().toUpperCase().match(/^([A-Z]{3})(?:\s|$|[—-])/);
  return match?.[1] ?? null;
}

export function timezoneForAirport(value: unknown): string | null {
  const code = airportCodeFromInput(value);
  return code ? timezones[code] ?? null : null;
}

export function airportTimezoneCount(): number {
  return Object.keys(timezones).length;
}
