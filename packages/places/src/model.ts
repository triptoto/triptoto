export type PlaceType = 'city' | 'airport';

export interface NormalizedPlace {
  id: string;
  type: PlaceType;
  name: string;
  displayName: string;
  localName?: string;
  aliases?: string[];
  countryName?: string;
  countryCode?: string;
  region?: string;
  cityName?: string;
  iata?: string;
  icao?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}
export interface PlaceSearchOptions {
  types?: PlaceType[];
  limit?: number;
  preferredType?: PlaceType;
}

export interface PlacesProvider {
  searchPlaces(query: string, options?: PlaceSearchOptions): Promise<NormalizedPlace[]>;
  getPlaceById(id: string): Promise<NormalizedPlace | null>;
  resolveAirport(code: string): Promise<NormalizedPlace | null>;
  resolveTimezone(place: NormalizedPlace | string): Promise<string | null>;
}
