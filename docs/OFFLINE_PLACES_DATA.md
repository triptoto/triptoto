# Offline places data

Dataset version: `2026-08-26`

Generated file: `public/data/places-2026-08-26.json`

The source archives are fetched only by the repeatable build and are not committed. The generated client dataset is committed because its sources permit commercial redistribution under the conditions below.

## Sources and licenses

### Cities: GeoNames `cities15000`

- Source: <https://download.geonames.org/export/dump/cities15000.zip>
- Source documentation: <https://download.geonames.org/export/dump/readme.txt>
- Snapshot/build date: 26 August 2026
- License: Creative Commons Attribution 4.0 (`CC BY 4.0`), <https://creativecommons.org/licenses/by/4.0/>
- Attribution: city data © GeoNames, <https://www.geonames.org/>
- Commercial use: allowed with attribution.
- Retained fields: GeoNames ID, canonical/local/common names and selected aliases, country and administrative region, latitude, longitude, population used only for ranking, and IANA timezone.

### Airport identity and service filter: OurAirports

- Sources: `airports.csv`, `countries.csv`, and `regions.csv` from <https://ourairports.com/data/>
- Snapshot/build date: 26 August 2026
- License: Public Domain / Unlicense, <https://github.com/davidmegginson/ourairports-data/blob/main/LICENSE>
- Attribution: not required; included here for provenance.
- Retained fields: airport name, scheduled-service/type flags used for filtering, municipality, country/region, IATA, ICAO where valid, latitude, longitude, and keywords used as aliases.

### Airport timezone and common city: mwgg/Airports

- Source: <https://github.com/mwgg/Airports/blob/master/airports.json>
- Snapshot/build date: 26 August 2026
- License: MIT, copyright © 2014 mwgg, <https://github.com/mwgg/Airports/blob/master/LICENSE>
- Retained fields: IANA timezone and common city, matched to the OurAirports record by consistent ICAO/IATA identity.
- The MIT copyright and permission notice must remain with substantial redistributed portions. This document and the public Terms data-attribution section provide the applicable notice/provenance.

MIT notice for the retained mwgg/Airports data:

> Copyright (c) 2014 mwgg
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

No scraped pages, paid API output, or runtime geocoding response is included.

## Transformations

`scripts/build-places-dataset.mjs` performs the complete deterministic transformation:

1. Decode GeoNames `cities15000` and parse the three CSV files plus airport-timezone JSON.
2. Keep GeoNames’ significant-city selection.
3. Keep OurAirports records with scheduled service, a valid three-letter IATA code, and large/medium/small airport type; private landing strips without that traveler value are excluded.
4. Normalize Unicode to NFC, collapse whitespace, normalize search-only strings to accent-insensitive lowercase tokens, deduplicate aliases, uppercase codes, and validate IANA timezone names using `Intl`.
5. Use stable IDs `city:geonames:<GeoNames ID>` and `airport:iata:<IATA>` rather than mutable row numbers or display text.
6. Add region context to ambiguous same-name cities.
7. Match airport timezone/common city by consistent ICAO/IATA identity. A missing or inconsistent match produces no timezone; it is never guessed from the device.
8. Strip every unused source field and emit deterministic ID-sorted compact tuples.

Current generated result:

- 34,114 cities
- 4,007 airports
- 38,121 total places
- 11,082,011 bytes in the committed JSON file (including its final newline)
- 2,780,471 bytes with `gzip -9` (normal HTTP compression may vary)

## Redistribution and attribution

The app’s Terms link to GeoNames and identify the airport sources. Keep this attribution visible whenever the generated dataset ships. Do not remove this document, the Terms attribution, the GeoNames CC BY notice, or the mwgg MIT notice when redistributing the generated data.

## Updating

Run `npm run update:places` with network access. Review the source licenses first, compare counts and byte size, inspect the required search scenarios, update `PLACES_DATA_VERSION` and service-worker cache/path, and run `npm run validate:places`. Source changes must never rewrite stored booking snapshots; only the replaceable client index changes.

If a source changes to an unclear or incompatible license, stop the update and retain the last reviewed dataset until a suitable source is approved.
