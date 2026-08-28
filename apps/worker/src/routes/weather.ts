import type { AuthContext, Env } from '../types.ts';
import { HttpError, json } from '../http.ts';

// Open-Meteo is free, key-less, and permits commercial use. We proxy it through
// the Worker so the browser never makes a cross-origin call, and so the edge
// cache absorbs repeated lookups for the same destination.
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const EDGE_TTL_SECONDS = 15 * 60;
const GEOCODE_TTL_SECONDS = 7 * 24 * 60 * 60;

function coordinate(raw: string | null, name: string, min: number, max: number): number {
  if (raw == null || raw.trim() === '') throw new HttpError(400, 'VALIDATION_ERROR', `${name} is required.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new HttpError(400, 'VALIDATION_ERROR', `${name} is invalid.`);
  return value;
}

// Resolve a place name (e.g. "New York") to coordinates via Open-Meteo's free,
// key-less geocoder. Cached hard at the edge since place->coordinate is stable.
async function geocode(query: string): Promise<{ latitude: number; longitude: number; place: string } | null> {
  const upstream = new URL(OPEN_METEO_GEOCODE);
  upstream.searchParams.set('name', query);
  upstream.searchParams.set('count', '1');
  upstream.searchParams.set('language', 'en');
  upstream.searchParams.set('format', 'json');
  try {
    const response = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: GEOCODE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return null;
    const payload: any = await response.json();
    const hit = Array.isArray(payload?.results) ? payload.results[0] : null;
    if (!hit || !Number.isFinite(Number(hit.latitude)) || !Number.isFinite(Number(hit.longitude))) return null;
    return { latitude: Number(hit.latitude), longitude: Number(hit.longitude), place: String(hit.name || query) };
  } catch (_error) {
    return null;
  }
}

// Expose the keyless geocoder as its own endpoint so the Trip Map can resolve
// address-only places to coordinates without a paid Maps API. Same-origin proxy
// keeps the strict CSP intact; the edge cache absorbs repeats.
export async function geocodePlace(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  if (!query) throw new HttpError(400, 'VALIDATION_ERROR', 'q is required.');
  const located = await geocode(query);
  if (!located) throw new HttpError(404, 'PLACE_NOT_FOUND', 'Could not locate that place.');
  return json({ location: located }, {}, request, env);
}

export async function currentWeather(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const latRaw = url.searchParams.get('lat');
  const lonRaw = url.searchParams.get('lon');
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);

  let latitude: number;
  let longitude: number;
  let resolvedPlace: string | null = null;
  if (latRaw != null && latRaw.trim() !== '') {
    latitude = coordinate(latRaw, 'lat', -90, 90);
    longitude = coordinate(lonRaw, 'lon', -180, 180);
  } else if (query) {
    const located = await geocode(query);
    if (!located) throw new HttpError(404, 'PLACE_NOT_FOUND', 'Could not locate that place.');
    latitude = located.latitude;
    longitude = located.longitude;
    resolvedPlace = located.place;
  } else {
    throw new HttpError(400, 'VALIDATION_ERROR', 'lat/lon or q is required.');
  }

  const upstream = new URL(OPEN_METEO);
  upstream.searchParams.set('latitude', latitude.toFixed(4));
  upstream.searchParams.set('longitude', longitude.toFixed(4));
  upstream.searchParams.set('current', 'temperature_2m,weather_code,is_day');
  upstream.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability,wind_speed_10m');
  upstream.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max');
  upstream.searchParams.set('wind_speed_unit', 'ms');
  upstream.searchParams.set('forecast_days', '7');
  upstream.searchParams.set('timezone', 'auto');

  let payload: any;
  try {
    const response = await fetch(upstream.toString(), {
      headers: { accept: 'application/json' },
      cf: { cacheTtl: EDGE_TTL_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) throw new Error(`upstream_${response.status}`);
    payload = await response.json();
  } catch (_error) {
    throw new HttpError(502, 'WEATHER_UNAVAILABLE', 'Weather data is temporarily unavailable.');
  }

  const current = payload?.current ?? {};
  const temperature = Number(current.temperature_2m);
  if (!Number.isFinite(temperature)) throw new HttpError(502, 'WEATHER_UNAVAILABLE', 'Weather data is temporarily unavailable.');

  const num = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

  const d = payload?.daily ?? {};
  const dates: unknown[] = Array.isArray(d.time) ? d.time : [];
  const daily = dates.slice(0, 7).map((date, i) => ({
    date: String(date),
    weatherCode: Number.isFinite(Number(d.weather_code?.[i])) ? Number(d.weather_code[i]) : null,
    tempMaxC: num(d.temperature_2m_max?.[i]),
    tempMinC: num(d.temperature_2m_min?.[i]),
    precipProb: num(d.precipitation_probability_max?.[i]),
    windMs: num(d.wind_speed_10m_max?.[i]),
  }));

  // Hourly strip: the next 6 hours starting at the current hour.
  const h = payload?.hourly ?? {};
  const htimes: unknown[] = Array.isArray(h.time) ? h.time : [];
  const nowHour = typeof current.time === 'string' ? current.time.slice(0, 13) : '';
  let startIdx = htimes.findIndex((t) => String(t).slice(0, 13) >= nowHour);
  if (startIdx < 0) startIdx = 0;
  const hourly = htimes.slice(startIdx, startIdx + 6).map((t, k) => {
    const i = startIdx + k;
    return {
      time: String(t),
      weatherCode: Number.isFinite(Number(h.weather_code?.[i])) ? Number(h.weather_code[i]) : null,
      tempC: num(h.temperature_2m?.[i]),
      precipProb: num(h.precipitation_probability?.[i]),
      windMs: num(h.wind_speed_10m?.[i]),
    };
  });

  const weather = {
    latitude,
    longitude,
    place: resolvedPlace,
    temperatureC: Math.round(temperature),
    weatherCode: Number.isFinite(Number(current.weather_code)) ? Number(current.weather_code) : null,
    isDay: Number(current.is_day) === 1,
    observedAt: typeof current.time === 'string' ? current.time : null,
    timezone: typeof payload?.timezone === 'string' ? payload.timezone : null,
    hourly,
    daily,
    fetchedAt: Date.now(),
  };

  const headers = new Headers();
  return json({ weather }, { headers }, request, env);
}
