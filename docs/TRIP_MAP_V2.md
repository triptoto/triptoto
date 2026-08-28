# tripto.to Trip Map V2 (Contextual)

Status: implemented in the V2 product prototype. The Trip Map is a **contextual
action**, not a permanent destination.

## Principle

The Timeline is the home of a trip. The map is an occasional lens on the same
data, offered only when it is genuinely useful. There is **no Map tab, no
Timeline|Map switch, and no permanent map header icon.** The Timeline stays
clean.

## Where it appears

Inside the central **+** menu (the Add sheet), a third option — **View Trip
Map** — appears *only* when the current trip has **2 or more distinct mappable
places**. Order in the menu:

1. Add Booking
2. View Trip Map — *conditional*
3. Create New Trip

Tapping it opens the Trip Map screen, which lists each destination separately.
When a trip has fewer than two distinct places, the option is absent.

## How the map works

tripto.to does **not** embed a paid map SDK and does **not** loosen the strict
CSP. Instead:

- **Inside tripto** the Trip Map screen lists the trip's places as **separate
  destinations**: type-coded icon, name, time, address, and a `NEXT` badge on the
  soonest upcoming place. **Tapping any row opens that one destination in Google
  Maps.** This list is part of tripto's offline cache, so it is readable with no
  connection.
- **Open all points in Google Maps** (secondary button) builds a Google Maps URL
  containing *every* point of the trip and opens it in Google Maps:
  - 1 point → a search pin (`maps/search/?api=1&query=`).
  - 2+ points → a multi-stop route through them
    (`maps/dir/?api=1&origin=…&destination=…&waypoints=a|b|c`).
  - The URL API supports origin + up to 9 waypoints + destination (11 points).
    If a trip has more, the extra stops are dropped **and reported via a toast** —
    never silently hidden.
- Coordinates are preferred for each point; address-only places are resolved to
  coordinates first via `/api/v1/geocode` (see below), falling back to the raw
  address/name string in the URL.

### Saving the map offline

Downloading a *map area* for offline use is a **Google Maps feature** performed
inside the Google Maps app (Google's own "Download offline map"). tripto.to
opens Google Maps with all the trip's points so the user can view and download
there. Within tripto itself, the **place list is already saved offline**, so the
trip's stops, times, and addresses remain available with no connection even when
Google Maps is not.

## What counts as a mappable place

A single canonical helper answers this for the whole app:

- `getMappableTripLocations()` → the deduplicated list of distinct places.
- `canShowTripMap()` → `getMappableTripLocations().length >= 2`.
- `orderedTripMapPlaces(day)` → those places for a day (or the whole trip),
  ordered by time; used by both the screen and the "open all" URL builder.

A location is **mappable** when it has either reliable coordinates (finite
lat/lon in range, excluding `0,0`) **or** a street-level address. A **city-only**
label is excluded. **Cancelled** bookings never contribute a place. Two
references sharing rounded coordinates or a normalized address collapse to one
place (`mapPlaceKey`).

## Navigation and location (no GPS)

**tripto.to never requests GPS.** There is no `navigator.geolocation`, no
current-location permission, no background location, and no location history.
The app shows no "You are here / Near you / N km from you / N minutes away"
copy. Every use of Google Maps is via its **URL scheme** only — for a single
place (Navigate) or for the whole trip (Open all points). Google Maps may use
its own location permission *after* it opens; that is outside tripto.to, which
only passes destinations.

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
| A | 0 mappable places | No + menu option; screen shows graceful fallback |
| B | 1 mappable place | No + menu option (needs 2 distinct) |
| C | 2+ distinct places | List of places + "Open all points in Google Maps" |
| D | Duplicate physical place | Counted once (dedup by coords/address) |
| E | City-only location | Excluded (not a point) |
| F | Cancelled booking | Excluded |
| G | Address-only place | Geocoded via `/api/v1/geocode` for a precise pin |
| H | Offline | No geocode; list still shown; Google Maps button guarded with a toast |
| I | No mappable tokens | Open-all guarded ("No mappable places to open yet") |
| J | Has a future booking | Soonest future place carries the `NEXT` badge |

## Contract

`tests/trip-map.contract.mjs` pins: contextual + menu entry (never a tab),
canonical eligibility helpers, states A–J, the no-GPS guarantee, the
open-all-points Google Maps URL (with reported waypoint cap), URL-only Google
Maps use (no embedded SDK, CSP untouched), route wiring, and the server geocode
endpoint.
