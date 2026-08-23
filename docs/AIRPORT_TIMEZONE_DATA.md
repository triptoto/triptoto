# Airport timezone data

tripto.to resolves flight event-local timezones offline from a bundled, exact
IATA-to-IANA mapping. It never substitutes the phone timezone or guesses from a
city name. Unknown or conflicting airport codes are rejected for correction.

The generated source is OpenFlights `airports.dat` from the
[`jpatokal/openflights`](https://github.com/jpatokal/openflights) repository.
OpenFlights publishes the database under the Open Database License (ODbL).
The update script keeps only airport records with a three-letter IATA code, a
valid IANA timezone, and one unambiguous timezone for that code.

Regenerate intentionally with:

```sh
npm run update:airport-timezones
npm run build:airport-timezones
```

The generated mapping is committed so airport recognition remains available
offline and builds do not depend on a live third-party service.
