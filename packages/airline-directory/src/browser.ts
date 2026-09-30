import {
  activeAirlines,
  airlineDirectoryCount,
  findAirline,
  isSafeStatusUrl,
  parseFlightDesignator,
  resolveFlightStatus,
} from './index.ts';

// Offline-bundled client surface. Everything is pure and data-local: no network,
// no API keys. Mirrors the TriptoAirportTimezones global convention.
Object.assign(globalThis, {
  TriptoAirlineDirectory: Object.freeze({
    resolveFlightStatus,
    findAirline,
    parseFlightDesignator,
    isSafeStatusUrl,
    activeAirlines,
    size: airlineDirectoryCount(),
  }),
});
