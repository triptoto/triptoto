# Country Guide

Offline practical facts for all 249 ISO 3166-1 countries and territories, opened from
**Trip options → Tools → Country Guide** (route `/country-guide`).

## Architecture

```
packages/country-guide/
  data/iso3166-1.json            the 249 codes (source of the record set)
  data/sources.lock.json         pinned npm tarballs + sha512 + lastReviewedAt
  data/country-overrides.json    reviewed corrections (iso2/field/value/reason/source/verifiedAt)
  data/sources/*.json            optional reviewed snapshots (electricity, typed emergency services)
  data/countries.generated.json  GENERATED snapshot - never edit by hand
  src/schema.ts                  types, GROUPS, FIELD_OWNERSHIP, CANONICAL_CONCEPTS, DERIVED_FIELDS
  src/validate.ts                dataset + override validation, raw duplicate-key scan
  src/index.ts                   lookup + derived selectors + shared comparison module
  src/browser.ts                 exposes globalThis.TriptoCountryGuide
scripts/update-country-guide.mjs generator (download, verify, build, validate, write)
public/country-guide.js          esbuild IIFE bundle (~170 KB, ~25 KB gzip), offline core asset
tests/country-guide.scenarios.mjs coverage, duplicates, provenance, edge matrix, wiring
```

`public/country-guide.js` is loaded with `defer` before `mobile-app.min.js` and is part of the
service worker `SHELL_PATHS` and atomic `CORE`, so the guide works offline after the first visit.

## One record per country

`countries[ISO2]` holds groups: `identity, language, currency, telecom, time, formats,
measurements, electricity, driving, emergency, practical` plus `_meta` (per-country
provenance only where it differs from the group default). Each field has exactly one owning
group (`FIELD_OWNERSHIP`); validation fails on a field in the wrong group, an alias spelling
of a canonical concept (`CANONICAL_CONCEPTS`), any stored derived value (`DERIVED_FIELDS`) or a
duplicate JSON key.

Derived values are selectors, never stored: `flagEmoji`, `primaryCurrency`, `isMultiZone`,
`clockPreference`, `sharedCallingCodeCountries`, `singleTimeZone`, `timeDifferenceMinutes`.

## Shared comparison module

`src/index.ts` is the single implementation used by the guide screen and the checklist:

- `comparePowerCompatibility(home, dest)` → `compatible | adapter_recommended |
  voltage_check_required | varies | unknown` (unknown whenever either side has no data).
- `compareCountries(home, dest, {homeZone, destinationZone, at})` → "What changes for you"
  differences. Unknown values are never reported as differences.
- `preparationNotes(home, countries)` → `power-adapter`, `voltage-check`, `driving-side`;
  "Add essentials" in the To-Do list appends them when a home country is set.
- `resolveTripCountries(visits)` → deduplicated countries ordered by first appearance with
  merged date ranges; transit-only (airport/station/port) countries dropped unless nothing else.

The app's former `COUNTRY_CURRENCY` table was removed; Currency and Tax Free use
`primaryCurrency` (the converter still limits itself to its supported currency list).

## Home country

Stored only on the device (`localStorage["tripto_home_country_v1"]`), set only by the
traveler's explicit choice in the guide. It is never inferred from GPS, IP, language, locale or
trip origin. For multi-zone home countries the device zone is used only if it belongs to the
chosen country; otherwise no time difference is shown.

## Screen

Trip-country chips (with dates) + any-country picker, home-country picker, Good to know,
What changes for you (home set only), Emergency numbers (`tel:` links with a "check official
local guidance" note), More (formats/units), links to Currency, Tax Free, Map and eSIM, and
About this data (group statuses, dataset version, sources and licences). Missing data is shown as
"Not available yet" or omitted, never filled in.

## Commands

```
npm run country-guide:update   # regenerate the snapshot (needs registry.npmjs.org)
npm run country-guide:check    # fail if the snapshot is stale
npm run build:country-guide    # rebuild public/country-guide.js (part of check:ui)
node --import tsx/esm tests/country-guide.scenarios.mjs
```

## Known gaps (honest status)

- **electricity**: `unavailable` for every country. No openly licensed machine-readable source
  was reachable from the build environment; drop a reviewed `data/sources/electricity.json` and
  regenerate (see data sources doc).
- **emergency**: `needs_review`. Numbers are the short numbers the phone network treats as
  emergency calls (libphonenumber), not mapped to police/ambulance/fire. 11 territories have none.
- **practical** (tap water, tipping, cards): `unavailable`.
