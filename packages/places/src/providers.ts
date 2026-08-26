import type { NormalizedPlace, PlaceSearchOptions, PlacesProvider } from './model.ts';
import {
  createPlacesIndex, getPlaceById, resolveAirport, searchPlaces,
  type CompactPlacesData, type PlacesIndex,
} from './search.ts';

export class OfflinePlacesProvider implements PlacesProvider {
  private index: PlacesIndex;

  constructor(data: CompactPlacesData) {
    this.index = createPlacesIndex(data);
  }

  async searchPlaces(query: string, options?: PlaceSearchOptions): Promise<NormalizedPlace[]> {
    return searchPlaces(this.index, query, options);
  }

  async getPlaceById(id: string): Promise<NormalizedPlace | null> {
    return getPlaceById(this.index, id);
  }

  async resolveAirport(code: string): Promise<NormalizedPlace | null> {
    return resolveAirport(this.index, code);
  }

  async resolveTimezone(place: NormalizedPlace | string): Promise<string | null> {
    const resolved = typeof place === 'string' ? await this.getPlaceById(place) : place;
    return resolved?.timezone || null;
  }
}
export abstract class OnlinePlacesProvider implements PlacesProvider {
  abstract searchPlaces(query: string, options?: PlaceSearchOptions): Promise<NormalizedPlace[]>;
  abstract getPlaceById(id: string): Promise<NormalizedPlace | null>;
  abstract resolveAirport(code: string): Promise<NormalizedPlace | null>;
  abstract resolveTimezone(place: NormalizedPlace | string): Promise<string | null>;
}
