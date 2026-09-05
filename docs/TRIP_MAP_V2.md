# tripto.to Trip Map V2 (Contextual)

Status: implemented in the V2 product prototype. The Trip Map is a **contextual
action**, not a permanent destination.

## Principle

The Timeline is the home of a trip. The map is an occasional lens on the same
data, offered only when it is genuinely useful. There is **no Map tab, no
Timeline|Map switch, and no permanent map header icon.** The Timeline stays
clean.

## Where it appears

Inside **Trip options**, the **Trip Map** card becomes available when the
current trip has **2 or more distinct mappable places**. Tapping it opens the
Trip Map screen, which lists each destination separately. When a trip has fewer
than two distinct places, the card explains what is missing and does not open a
fabricated map.

## How the map works

tripto.to does **not** embed a paid map SDK and does **not** loosen the strict
CSP. Instead:

- **Inside tripto** the Trip Map screen lists the trip's places as **separate
  destinations**: type-coded icon, name, time, address, and a `NEXT` badge on the
  soonest upcoming place. **Tapping any row opens that one destination in Google
  Maps.** This list is part of tripto's offline cache, so it is readable with no
  connection.
- There is **no Open all points action**. The complete itinerary is never sent
  to Google Maps. Coordinates are preferred only for the destination the user
  explicitly taps; address-only places are resolved via `/api/v1/geocode`,
  falling back to the raw address/name in that single-destination URL.

### Saving the map offline

Within tripto itself, the **place list is already saved offline**, so the trip's
stops, times, and addresses remain available with no connection. Directions are
an explicit online action for one selected destination.

## What counts as a mappable place

A single canonical helper answers this for the whole app:

- `getMappableTripLocations()` → the deduplicated list of distinct places.
- `canShowTripMap()` → `getMappableTripLocations().length >= 2`.
- `orderedTripMapPlaces(day)` → those places for a day (or the whole trip),
  ordered by time for the screen.

A location is **mappable** when it has either reliable coordinates (finite
lat/lon in range, excluding `0,0`) **or** a street-level address. A **city-only**
label is excluded. **Cancelled** bookings never contribute a place. Two
references sharing rounded coordinates or a normalized address collapse to one
place (`mapPlaceKey`).

## Navigation and location (no GPS)

**tripto.to never requests GPS.** There is no `navigator.geolocation`, no
current-location permission, no background location, and no location history.
The app shows no "You are here / Near you / N km from you / N minutes away"
copy. Every use of Google Maps is via its **URL scheme** only for the single
place the traveler tapped. Google Maps may use its own location permission
*after* it opens; that is outside tripto.to. tripto.to never passes the complete
itinerary.

## Geocoding (keyless, same-origin)

Address-only places are resolved through `/api/v1/geocode`, a same-origin Worker
proxy over Open-Meteo's free, key-less geocoder (the same source used for
weather), so the Google Maps URL can use precise coordinates. Results are cached
in `localStorage` (`tripto_geocode_cache`). Offline, no geocode is attempted and
the place list still renders. The strict CSP is untouched — no external map or
tile host is added. Note: this keyless geocoder resolves place/city names well
but not every specific street address; unresolved places fall back to their
address string in the Google Maps link.

## Eligibility / state matrix

| State | Condition | Result |
|-------|-----------|--------|
| A | 0 mappable places | Trip Map card explains that more places are needed |
| B | 1 mappable place | Card remains unavailable (needs 2 distinct) |
| C | 2+ distinct places | Ordered place list with individual directions |
| D | Duplicate physical place | Counted once (dedup by coords/address) |
| E | City-only location | Excluded (not a point) |
| F | Cancelled booking | Excluded |
| G | Address-only place | Geocoded via `/api/v1/geocode` for precise directions |
| H | Offline | No geocode; list still shown; individual directions show a recovery toast |
| I | Has a future booking | Soonest future place carries the `NEXT` badge |

## Contract

`tests/trip-map.contract.mjs` pins: contextual Trip options entry,
canonical eligibility helpers, the no-GPS guarantee, removal of multi-point
Google Maps URLs, single-destination URL-only directions (no embedded SDK, CSP
untouched), route wiring, and the server geocode endpoint.
