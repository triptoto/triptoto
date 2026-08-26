/// <reference lib="webworker" />
import {
  PLACES_DATA_URL, createPlacesIndex, getPlaceById, resolveAirport, searchPlaces,
  type CompactPlacesData, type PlacesIndex,
} from './search.ts';

declare const self: DedicatedWorkerGlobalScope;
let indexPromise: Promise<PlacesIndex> | null = null;

function loadIndex(): Promise<PlacesIndex> {
  if (!indexPromise) {
    indexPromise = fetch(PLACES_DATA_URL, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`Places download failed (${response.status}).`);
        return response.json() as Promise<CompactPlacesData>;
      })
      .then(createPlacesIndex)
      .catch((error) => {
        indexPromise = null;
        throw error;
      });
  }
  return indexPromise;
}

self.addEventListener('message', async (event) => {
  const { id, action, payload = {} } = event.data || {};
  try {
    const index = await loadIndex();
    let result: unknown;
    if (action === 'search') result = searchPlaces(index, payload.query, payload.options);
    else if (action === 'get') result = getPlaceById(index, payload.id);
    else if (action === 'airport') result = resolveAirport(index, payload.code);
    else throw new Error('Unsupported places operation.');
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : 'Places search is unavailable.' });
  }
});
