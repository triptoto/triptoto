# tripto.to Mobile App UI v1

tripto.to is now implemented as a mobile application. The primary viewport is 390 × 844 and the supported range is 360–430 CSS pixels. Wider browsers show the same app centered at a maximum width of 430px; there is no separate desktop dashboard.

## Visual system

- Navy `#141948`
- Indigo `#2F3BAB`
- Yellow `#FEBF02`
- Off-white `#F2F4F7`
- White surfaces, thin separators and restrained shadows
- Yellow only for the primary action or urgent attention
- 44px+ touch targets and iPhone safe-area support

## Information hierarchy

Home prioritizes the current trip, the next itinerary item, scheduled time/locations, the primary boarding-pass or navigation action, the next few plans and Trip Health. The screen avoids dashboard statistics, nested cards and long explanations.

## Real-data integration

The mobile frontend reads the existing Beta Candidate APIs and local storage: trips, account/session, timeline, deterministic What’s Next, transport, stays, locations, travelers, booking details, contacts, expanded Trip Health, checksum-verified IndexedDB documents, Ready Offline caches and sync state.

Unavailable values remain unavailable. No gate, seat, status, address, document or live-flight value is invented. Flight screens explicitly label booking information as scheduled data while live-flight integration is disabled.

## Screens

Home, Timeline, Flight Detail, Hotel Detail, Bookings, Documents, Ready Offline, Trip Health, Account, Add Booking bottom sheet, Add Document bottom sheet and Show to Driver.

## Advanced fallback

The former complete Beta Candidate interface remains at `/legacy.html`. Add/edit flows not yet rebuilt natively open that interface through `legacy-bridge.js`, preserving existing functionality while the new mobile UI is the default.

## Preview mode

Append `?preview=1` for a realistic visual preview that makes no API requests. Preview data is isolated and never used in normal operation.
