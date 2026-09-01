# tripto.to Mobile App UI v1

tripto.to is now implemented as a mobile application. The primary viewport is 390 × 844 and the supported range is 360–430 CSS pixels. Wider browsers show the same app centered at a maximum width of 430px; there is no separate desktop dashboard.

## Visual system

- Background: warm light `#EEEEEE`
- Card fill: white `#FFFFFF`
- Quiet controls: `#E4E4E4`
- Borders: `#DDDDDD`
- Icons and primary text: `#111217`
- Secondary text: `#5A5A5A`
- Primary accent: coral `#CB2957`
- Verified success text: `#1B704B`
- Flat surfaces, thin separators and restrained shadows
- 44px+ touch targets and iPhone safe-area support

## Information hierarchy

Home prioritizes the current trip, the next itinerary item, scheduled time/locations, the primary boarding-pass or navigation action, the next few plans and Trip Health. The screen avoids dashboard statistics, nested cards and long explanations.

## Real-data integration

The mobile frontend reads the existing Beta Candidate APIs and local storage: trips, account/session, timeline, deterministic What’s Next, transport, stays, locations, travelers, booking details, contacts, expanded Trip Health, checksum-verified IndexedDB documents, Ready Offline caches and sync state.

Unavailable values remain unavailable. No gate, seat, status, address, document or live-flight value is invented. Flight screens explicitly label booking information as scheduled data while live-flight integration is disabled.

## Screens

Welcome, Timeline, Alerts, To-do, Flight Detail, Hotel Detail, Bookings, Documents, Ready Offline, Trip Health, Account, Add Booking bottom sheet, Add Document bottom sheet and Show to Driver.

Authenticated bottom navigation is exactly `Trip | Alerts | + | To-do | Account`.

## Single presentation layer

Product V2 uses one traveler-facing presentation layer. Checklist creation and traveler editing are native mobile flows; the obsolete `/legacy.html` theme stack is no longer shipped or cached.

`PRODUCTION_DESIGN.md` is the current visual and navigation source of truth.

## Preview mode

Append `?preview=1` for a realistic visual preview that makes no API requests. Preview data is isolated and never used in normal operation.
