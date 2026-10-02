# Country Guide data sources

All sources are free and openly licensed, pinned in `packages/country-guide/data/sources.lock.json`
(npm tarball version + sha512, verified on download). No AI, no paid API, no scraping at runtime.

| Group | Fields | Source | Licence | Status |
|---|---|---|---|---|
| identity | name, localNames | ICU `Intl.DisplayNames` (CLDR 48) | Unicode-3.0 | stable_source |
| identity | iso3, numericCode, internetTld | country-coder 5.6.1 | ISC | stable_source |
| identity | capital | countries-list 3.4.1 | MIT | stable_source |
| identity | region, subregion (UN M49) | CLDR 48.2 territoryContainment | Unicode-3.0 | stable_source |
| language | official / widely used (>=20 %) | CLDR territoryInfo | Unicode-3.0 | stable_source |
| currency | current legal tender, ordered | CLDR currencyData | Unicode-3.0 | stable_source |
| telecom | callingCodes | libphonenumber-js 1.13.14 (fallback country-coder, recorded in `_meta`) | MIT / ISC | stable_source |
| time | IANA zones (current names via cldr-bcp47 aliases) | ICU `Intl.Locale.getTimeZones` (tz 2026a) | Unicode-3.0 | stable_source |
| formats | date/time pattern, week start, separators | ICU + CLDR weekData, likely locale | Unicode-3.0 | stable_source |
| measurements | system, units | CLDR measurementData / unitPreferenceData; road speed from country-coder | Unicode-3.0 / ISC | stable_source |
| driving | drivingSide | country-coder | ISC | stable_source |
| emergency | numbers | Google libphonenumber 3.2.47 ShortNumberMetadata (`isEmergencyNumber`, shortest prefix) | Apache-2.0 | needs_review |
| electricity | voltage, frequency, plugTypes | none yet | - | unavailable |
| practical | tap water, tipping, cards, cash | none yet | - | unavailable |

Rejected: the npm `emergency-numbers` package (wrong values, e.g. Australia `0`); Wikipedia
tables (not reachable from the build sandbox at generation time; CC BY-SA would also require
attribution in the UI).

## Optional reviewed snapshots (`data/sources/`)

`electricity.json`:

```json
{
  "source": { "id": "electricity-review", "name": "...", "version": "rev 123", "license": "CC BY-SA 4.0", "url": "https://...", "retrievedAt": "2026-10-02" },
  "status": "needs_review",
  "countries": { "IT": { "voltage": [230], "frequency": [50], "plugTypes": ["C", "F", "L"] } }
}
```

`emergency-services.json` (typed numbers; never guessed from the number list):

```json
{
  "source": { "id": "emergency-review", "name": "...", "license": "...", "url": "https://...", "retrievedAt": "2026-10-02" },
  "countries": { "IT": { "general": "112" } }
}
```

## Overrides

`data/country-overrides.json` entries: `{ "iso2", "field": "group.field", "value" (null removes),
"reason", "source", "verifiedAt", "status"? }`. Each applied override is recorded in the
country's `_meta`. `verified` status requires `source` + `verifiedAt`.

## Updating

1. Bump a version in `sources.lock.json` (version, tarball URL, sha512 from
   `npm view <pkg>@<ver> dist.integrity`).
2. `npm run country-guide:update` - downloads to `.cache/country-guide/`, verifies sha512,
   regenerates, validates and writes the snapshot. The datasetVersion only changes when content changes.
3. `npm run build:country-guide` and run the contract test.
4. Review the git diff of `countries.generated.json` before committing.

## How to add a new field without creating duplicate data

1. Check `FIELD_OWNERSHIP` and `CANONICAL_CONCEPTS` in `src/schema.ts`. If the fact already
   exists under any spelling (e.g. "timezone" vs `time.timeZones`), use the existing field.
2. If it can be calculated from existing fields (flag, "multiple zones", 12/24 h, time
   difference, adapter needed), write a selector in `src/index.ts` instead and, if useful,
   add its name to `DERIVED_FIELDS` so it can never be stored.
3. Otherwise add it to exactly one group: the type in `schema.ts`, the group's
   `FIELD_OWNERSHIP` list, and any alternative spellings to `CANONICAL_CONCEPTS`.
4. Fill it only from a licensed source in `scripts/update-country-guide.mjs` (or a reviewed
   snapshot in `data/sources/`), add the source to `SOURCE_INFO` and the group provenance.
5. Add a value check to `validateDataset`, regenerate, and extend the contract test edge matrix.
6. Never add the fact to `public/mobile-app.js` as a separate table; read it through
   `TriptoCountryGuide`.
