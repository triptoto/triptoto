# Offline city and airport search

## Architecture

The places subsystem is a local-first boundary, separate from trip data and from the existing airline, operator, hotel-chain, timezone, and saved-trip-location suggestions.

- `PlacesProvider` defines `searchPlaces`, `getPlaceById`, `resolveAirport`, and `resolveTimezone`.
- `OfflinePlacesProvider` is the only active implementation. Browser calls are sent to a dedicated Web Worker, so parsing and ranking do not block input or scrolling.
- `OnlinePlacesProvider` is an abstract future boundary. It is not instantiated, connected, or exposed in the interface.
- `NormalizedPlace` uses a stable ID and explicit `city` or `airport` type. Optional values are omitted rather than invented.

The optimized file is not part of the critical app shell. Opening an enabled location field lazy-loads `places-provider.js`; the worker then fetches the versioned data file. Queries stay inside the browser.

## Search behavior

The pre-normalized index supports city and airport names, local/common aliases, country and region context, IATA and ICAO codes, and accent/case-insensitive matching. Ranking prefers exact IATA/ICAO, canonical city matches, airport-city matches, exact aliases, prefixes, token prefixes, substrings, and finally bounded edit distance. Typo matching is disabled for short queries. Results are limited to at most ten.

The mobile component uses combobox/listbox semantics, arrow-key navigation, Enter selection, Escape dismissal, a visible active option and focus state, and 44px-or-larger controls. City and airport rows are distinct; airport codes remain visible. A failed first download offers **Try again** and **Enter manually**, so booking creation is never blocked.

## Form integration and snapshots

- Create Trip uses city-first city/airport search for the destination.
- Flight From and To use airport-only search.
- Train/ferry continues to use saved trip locations and manual input. This data is not presented as a station directory.
- Hotel, restaurant, and activity names remain manual. This data is not presented as a business or venue directory.

On save, selected data is copied into the trip location record: stable place ID, display/local name, type, city, country, region, coordinates, timezone, IATA, and ICAO when available. Historical bookings therefore render from their snapshot if the bundled dataset changes or is unavailable. Migration `0018_offline_place_snapshots.sql` only adds snapshot columns and an index.

## Timezones

A selected city or airport supplies its IANA timezone automatically. The traveler does not need to understand IANA identifiers for known locations. The existing full timezone autocomplete remains the explicit manual fallback when the user enters an unknown place. The device timezone is never substituted for an unknown event location.

## Offline caching and versions

`PLACES_DATA_VERSION` versions the data independently from user data. The service worker uses a dedicated `tripto-places-<version>` cache. Nothing is downloaded at Welcome or ordinary app startup. After the first successful location search load, the provider, worker, and data are reusable offline. Activating a new service worker removes only obsolete places-cache versions; stored trip snapshots are unchanged.

Update procedure:

1. Review source licenses and source schema changes.
2. Set the new version in `scripts/build-places-dataset.mjs` and `packages/places/src/search.ts`.
3. Run `npm run update:places` and inspect deterministic counts/size.
4. Update the places cache/path constants in `public/sw.js`.
5. Run `npm run validate:places`, `npm run check:ui`, and the complete candidate/V2 suites.
6. Review representative city/airport rankings and mobile keyboard behavior before release.

## Privacy boundary

Search terms are not sent to the Worker API, a third party, or analytics. There is no Google Places, Mapbox, HERE, Apple Maps search, or other online geocoder in this milestone. A future online provider must document consent, query transmission, retention, failure, billing, and privacy separately before any “search more online” control is shown.

## Known limitations

- Coverage is significant cities (roughly 15,000+ population in the source), not every settlement.
- Airports are scheduled-service airports with valid IATA codes, not every private airstrip.
- The data has no venues, exact addresses, hotels, restaurants, attractions, or global train/ferry stations.
- Aliases and airport-city associations depend on the upstream sources and can occasionally be incomplete.
- Manual entry remains necessary for an unknown or newly renamed place and requires explicit timezone review.

See [OFFLINE_PLACES_DATA.md](OFFLINE_PLACES_DATA.md) for source, license, transformation, and attribution details.
