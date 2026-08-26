import type { NormalizedPlace, PlaceSearchOptions, PlaceType } from './model.ts';

export const PLACES_DATA_VERSION = '2026-08-26';
export const PLACES_DATA_URL = `/data/places-${PLACES_DATA_VERSION}.json`;

type CompactRow = [
  string, PlaceType, string, string, string | null, string[], string | null,
  string | null, string | null, string | null, string | null, string | null,
  number | null, number | null, string | null, number, string,
];

export interface CompactPlacesData {
  version: string;
  cities: number;
  airports: number;
  places: CompactRow[];
}

interface IndexedPlace extends NormalizedPlace {
  _population: number;
  _search: string;
  _name: string;
  _city: string;
  _aliases: string[];
  _words: string[];
}

export interface PlacesIndex {
  places: IndexedPlace[];
  byId: Map<string, IndexedPlace>;
  byAirport: Map<string, IndexedPlace>;
  byPrefix: Map<string, Set<IndexedPlace>>;
  byInitial: Map<string, Set<IndexedPlace>>;
  byInitialLength: Map<string, Set<IndexedPlace>>;
}

export function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function clean(place: IndexedPlace): NormalizedPlace {
  const { _population, _search, _name, _city, _aliases, _words, ...result } = place;
  return result;
}

export function createPlacesIndex(data: CompactPlacesData): PlacesIndex {
  if (!data || data.version !== PLACES_DATA_VERSION || !Array.isArray(data.places))
    throw new Error('The saved places index needs an update.');
  const places: IndexedPlace[] = data.places.map((row) => {
    const [id, type, name, displayName, localName, aliases, countryName,
      countryCode, region, cityName, iata, icao, latitude, longitude,
      timezone, population, search] = row;
    const words = Array.from(new Set(search.split(' ').filter(Boolean)));
    return {
      id, type, name, displayName,
      ...(localName ? { localName } : {}),
      ...(aliases?.length ? { aliases } : {}),
      ...(countryName ? { countryName } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(region ? { region } : {}),
      ...(cityName ? { cityName } : {}),
      ...(iata ? { iata } : {}),
      ...(icao ? { icao } : {}),
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
      ...(timezone ? { timezone } : {}),
      _population: population || 0,
      _search: search,
      _name: normalizeSearchText(name),
      _city: normalizeSearchText(cityName),
      _aliases: (aliases || []).map(normalizeSearchText),
      _words: words,
    };
  });
  const byId = new Map(places.map((place) => [place.id, place]));
  const byAirport = new Map<string, IndexedPlace>();
  const byPrefix = new Map<string, Set<IndexedPlace>>();
  const byInitial = new Map<string, Set<IndexedPlace>>();
  const byInitialLength = new Map<string, Set<IndexedPlace>>();
  for (const place of places) {
    for (const word of place._words) {
      const initial = word[0];
      if (initial) {
        const bucket = byInitial.get(initial) || new Set<IndexedPlace>();
        bucket.add(place);
        byInitial.set(initial, bucket);
        const lengthKey = `${initial}:${word.length}`;
        const lengthBucket = byInitialLength.get(lengthKey) || new Set<IndexedPlace>();
        lengthBucket.add(place);
        byInitialLength.set(lengthKey, lengthBucket);
      }
      for (let length = 2; length <= Math.min(12, word.length); length += 1) {
        const prefix = word.slice(0, length);
        const bucket = byPrefix.get(prefix) || new Set<IndexedPlace>();
        bucket.add(place);
        byPrefix.set(prefix, bucket);
      }
    }
    if (place.type !== 'airport') continue;
    if (place.iata) byAirport.set(place.iata.toUpperCase(), place);
    if (place.icao) byAirport.set(place.icao.toUpperCase(), place);
  }
  return { places, byId, byAirport, byPrefix, byInitial, byInitialLength };
}

function editDistanceWithin(left: string, right: string, max = 2): number | null {
  if (Math.abs(left.length - right.length) > max) return null;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const value = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
      current[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return null;
    previous = current;
  }
  return previous[right.length] <= max ? previous[right.length] : null;
}

function scorePlace(place: IndexedPlace, query: string, rawQuery: string, preferredType?: PlaceType): number {
  const code = rawQuery.trim().toUpperCase();
  let score = 0;
  if (code.length >= 3 && place.iata === code) score = 1200;
  else if (code.length >= 3 && place.icao === code) score = 1160;
  else if (place._name === query) score = place.type === 'city'
    ? 1050 + Math.min(130, Math.log10(place._population + 1) * 20) : 1010;
  else if (place._city === query) score = place.type === 'city' ? 1000 : 1160;
  else if (place._aliases.includes(query)) score = place.type === 'city'
    ? 1040 + Math.min(120, Math.log10(place._population + 1) * 18) : 970;
  else if (place.type === 'city' && place._name.startsWith(query)) score = 900;
  else if (place.type === 'airport' && place._city.startsWith(query)) score = 870;
  else if (place.type === 'airport' && place._name.startsWith(query)) score = 840;
  else if (place._aliases.some((alias) => alias.startsWith(query))) score = 800;
  else if (query.split(' ').every((token) => place._words.some((word) => word.startsWith(token)))) score = 690;
  else if (place._search.includes(query)) score = 560;
  else if (query.length >= 5) {
    const candidates = [place._name, place._city, ...place._aliases, ...place._words]
      .filter((value) => value && Math.abs(value.length - query.length) <= 2);
    let best: number | null = null;
    for (const candidate of candidates) {
      const distance = editDistanceWithin(query, candidate, query.length >= 8 ? 2 : 1);
      if (distance != null && (best == null || distance < best)) best = distance;
    }
    if (best != null) score = 420 - best * 45;
  }
  if (!score) return 0;
  if (preferredType && place.type === preferredType) score += 35;
  return score;
}

export function searchPlaces(index: PlacesIndex, rawQuery: string, options: PlaceSearchOptions = {}): NormalizedPlace[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) return [];
  const types = new Set(options.types?.length ? options.types : ['city', 'airport']);
  const limit = Math.max(1, Math.min(10, options.limit || 8));
  const airport = rawQuery.trim().length >= 3 ? index.byAirport.get(rawQuery.trim().toUpperCase()) : null;
  const tokens = query.split(' ').filter(Boolean);
  let candidates = new Set<IndexedPlace>();
  const prefixBuckets = tokens.map((token) => index.byPrefix.get(token.slice(0, Math.min(12, token.length))));
  if (prefixBuckets.every(Boolean)) {
    const [smallest, ...others] = prefixBuckets
      .map((bucket) => bucket as Set<IndexedPlace>)
      .sort((left, right) => left.size - right.size);
    candidates = new Set(Array.from(smallest).filter((place) => others.every((bucket) => bucket.has(place))));
  }
  // Lightweight typo recovery: widen a small single-word result set using its
  // first three letters, then let bounded edit distance score the additions.
  // This covers common misspellings without scanning every place on each key.
  if (query.length >= 5 && tokens.length === 1 && candidates.size < 20) {
    const fuzzyPrefix = query.slice(0, Math.min(3, query.length));
    const fuzzyPool = index.byPrefix.get(fuzzyPrefix);
    if (fuzzyPool) {
      for (const place of fuzzyPool) candidates.add(place);
    } else {
      for (let length = Math.max(2, query.length - 2); length <= query.length + 2; length += 1) {
        for (const place of index.byInitialLength.get(`${query[0]}:${length}`) || []) candidates.add(place);
      }
    }
  }
  const matches: Array<{ place: IndexedPlace; score: number }> = [];
  for (const place of candidates) {
    if (!types.has(place.type)) continue;
    const score = scorePlace(place, query, rawQuery, options.preferredType);
    if (score) matches.push({ place, score });
  }
  if (airport && types.has('airport') && !matches.some(({ place }) => place === airport)) {
    matches.push({ place: airport, score: scorePlace(airport, query, rawQuery, options.preferredType) });
  }
  matches.sort((left, right) =>
    right.score - left.score ||
    right.place._population - left.place._population ||
    left.place.displayName.localeCompare(right.place.displayName),
  );
  return matches.slice(0, limit).map(({ place }) => clean(place));
}

export function getPlaceById(index: PlacesIndex, id: string): NormalizedPlace | null {
  const place = index.byId.get(String(id));
  return place ? clean(place) : null;
}

export function resolveAirport(index: PlacesIndex, code: string): NormalizedPlace | null {
  const place = index.byAirport.get(String(code).trim().toUpperCase());
  return place ? clean(place) : null;
}
