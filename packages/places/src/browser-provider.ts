import type { NormalizedPlace, PlaceSearchOptions, PlacesProvider } from './model.ts';
import { PLACES_DATA_URL, PLACES_DATA_VERSION } from './search.ts';

type WorkerRequest = { id: number; action: string; payload?: unknown };

class BrowserOfflinePlacesProvider implements PlacesProvider {
  private worker: Worker | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; timer: number }>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(`/places-search-worker.js?v=${PLACES_DATA_VERSION}`);
    worker.addEventListener('message', (event) => {
      const message = event.data || {};
      const pending = this.pending.get(message.id);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.ok) pending.resolve(message.result);
      else pending.reject(new Error(message.error || 'Places search is unavailable.'));
    });
    worker.addEventListener('error', () => this.failWorker('Places search could not load.'));
    this.worker = worker;
    return worker;
  }

  private failWorker(message: string): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error(message));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  retry(): void {
    this.failWorker('Retrying places search.');
  }

  private request<T>(action: string, payload?: unknown): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Places search took too long. Try again.'));
      }, 15000);
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject, timer });
      this.ensureWorker().postMessage({ id, action, payload } satisfies WorkerRequest);
    });
  }

  searchPlaces(query: string, options?: PlaceSearchOptions): Promise<NormalizedPlace[]> {
    return this.request('search', { query, options });
  }

  getPlaceById(id: string): Promise<NormalizedPlace | null> {
    return this.request('get', { id });
  }

  resolveAirport(code: string): Promise<NormalizedPlace | null> {
    return this.request('airport', { code });
  }

  async resolveTimezone(place: NormalizedPlace | string): Promise<string | null> {
    const resolved = typeof place === 'string' ? await this.getPlaceById(place) : place;
    return resolved?.timezone || null;
  }
}

const provider = new BrowserOfflinePlacesProvider();
Object.assign(globalThis, {
  TriptoPlaces: Object.freeze({
    PLACES_DATA_VERSION,
    PLACES_DATA_URL,
    provider,
    OfflinePlacesProvider: BrowserOfflinePlacesProvider,
    OnlinePlacesProvider: class OnlinePlacesProvider {},
  }),
});
