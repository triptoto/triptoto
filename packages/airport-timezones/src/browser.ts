import {
  airportCodeFromInput,
  airportTimezoneCount,
  timezoneForAirport,
} from './index.ts';

Object.assign(globalThis, {
  TriptoAirportTimezones: Object.freeze({
    airportCodeFromInput,
    timezoneForAirport,
    size: airportTimezoneCount(),
  }),
});
