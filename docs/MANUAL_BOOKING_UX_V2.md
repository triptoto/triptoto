# Manual Booking UX V2

## Scope

Manual Booking UX V2 keeps the existing Product V2 navigation and backend architecture while making manual entry purpose-built for travelers. The Add Booking screen still offers exactly Upload Booking, Forward Confirmation Email, and Add Manually. Add Manually contains Flight, Hotel / Stay, Train, Car Rental, Transfer, Cruise, Ferry, Restaurant, Activity / Event, and Other.

The forms share a mobile shell, sticky booking-specific action, inline validation, contextual Tickets & Documents, and one collapsed More Details disclosure. They do not expose database fields or diagnostic terminology.

## Essential and secondary fields

| Booking | Essentials | More Details |
| --- | --- | --- |
| Flight | Airline, flight number, from, to, departure date and local time | Optional arrival, terminal, gate, boarding/gate-close time, PNR, ticket, seat, cabin, baggage, operated by, travelers, notes |
| Hotel / Stay | Property, city/location, check-in and check-out | Address, confirmation, room, check-in/out time, phone, email, travelers, notes |
| Train | From, to, departure date/time, optional service | Arrival, operator, platform, coach, seat, reference, travelers, notes |
| Car Rental | Company, pickup and drop-off locations, dates and times | Confirmation, vehicle/class, driver, phone, travelers, notes |
| Transfer | From, to, date/time, optional provider | Phone, confirmation, vehicle, driver, travelers, notes |
| Cruise | Cruise line, departure port/date, optional ship/time, return port/date | Booking number, cabin, deck, embarkation details, travelers, notes |
| Ferry | From, to, date/time, optional operator | Arrival, reference, vehicle, travelers, notes |
| Restaurant | Restaurant, date/time, guest count, optional location | Address, confirmation, phone, travelers, notes |
| Activity / Event | Subtype, title, date/time, location/venue | End time, provider, confirmation, seat/section, address, travelers, notes |
| Other | Title, date, optional time/location | End date/time, confirmation, travelers, notes |

## Places and timezone behavior

Flight airport fields use the lazy, on-device PlacesProvider search and prioritize exact airport-code matches. Selecting a known airport stores a stable place snapshot and its IANA timezone. The primary form describes this as the airport city’s local time; the IANA identifier is kept internally. Manual timezone correction appears only when the selected or typed location cannot be resolved reliably. The device timezone is never substituted for an unknown event location.

Hotel and general destination fields may use city/airport context. Train, ferry, cruise, transfer, and other station/port/venue inputs continue to support existing trip locations and manual text. The cities-and-airports dataset is not presented as a station or venue directory.

## Tickets & Documents

Every manual booking form includes one reusable multi-file Tickets & Documents section. The native picker accepts PDF, common browser-supported images, and Wallet passes supported by the existing local document system. Files are staged in IndexedDB with a SHA-256 checksum and a stable booking-draft ID. Raw bytes never go to the Worker or D1.

After the booking API returns its item ID, each staged file is materialized into the existing local `docs` store with the booking relationship, document type, traveler assignment, checksum, and device-local status. Duplicate checksums are not stored twice. The current limits remain 10 MB per file and 20 local documents per trip.

If the booking succeeds and one or more files cannot be materialized, the booking remains in the Timeline and the failed attachment draft remains available for retry. If booking creation fails, the staged files and field draft remain intact. The UI never claims cloud backup or cross-device sync for these files.

## Drafts and recovery

Each purpose-built category has a distinct draft identity, so Car Rental cannot overwrite a Transfer draft and Cruise cannot overwrite Activity. Text/select state, the More Details state, and staged file metadata survive ordinary rerenders and recoverable submission errors. Back, browser Back, and close actions use the existing discard confirmation whenever meaningful changes exist.

Duplicate submission is prevented by the form’s `aria-busy` state and disabled sticky action. Booking creation is completed before attachment materialization; partial attachment failure is reported separately rather than inviting a second booking submission.

New manual booking creates also carry a stable, opaque client request ID. The Worker scopes that ID to the authenticated device and trip, fingerprints only normalized booking semantics, and replays the original booking when the same request is retried. A reused ID with different booking details is rejected. Request bodies, confirmation data, and document bytes are not stored in the idempotency table.

## Date, time, and validation

Date ranges use one touch calendar. Event-local date/time values are converted to UTC only with the location-derived or explicitly corrected IANA timezone. Flights require a departure; arrival may remain unavailable and can cross midnight or the date line when supplied. Hotel and car-rental end dates cannot precede their start dates. Inline errors focus and reveal the relevant field without clearing valid input.

Scheduled data is labeled as scheduled and is never presented as live. Gate, terminal, seat, arrival, provider, address, and confirmation values remain absent when the traveler did not enter them.

## Mobile keyboard and accessibility

The form shell uses the existing `visualViewport` keyboard offset. Focused inputs are kept visible, suggestion lists can scroll above the keyboard, and the sticky action moves above the keyboard and safe-area inset. Form controls and attachment rows use 44 px minimum targets. Place suggestions use combobox/listbox semantics with Arrow keys, Enter, Escape, active-option state, and visible focus. More Details is a semantic disclosure and validation messages use live alert/status regions.

## Known limitations

- Document bytes remain on the device where they were selected; R2 and public document sharing remain disabled.
- A browser that clears site storage also removes local document bytes and staged attachment drafts.
- The offline places catalog contains cities and commercial airports, not global train stations, ports, hotels, restaurants, or venues.
- Manual booking creation requires connectivity because the authoritative booking record is stored in D1. Existing cached trips and local documents remain available offline.
- Contextual document classification is suggested from booking type and filename; users may correct it, and no generative AI is used.

## Schema changes

- `0019_optional_flight_arrival.sql` preserves existing transport and flight data while allowing a manually entered flight to omit an unknown scheduled arrival. A scheduled departure remains required.
- `0020_manual_booking_idempotency.sql` adds the trip/device-scoped request ledger used to prevent duplicate booking creates after a timeout or interrupted response. It stores opaque identifiers and a SHA-256 request fingerprint, not document bytes or raw booking payloads.

Both migrations are versioned and data-preserving. Migration 0019 rebuilds only the `flights` table to relax the arrival constraint while copying every existing column; migration 0020 is additive. The local attachment database upgrade is separate from D1: IndexedDB moves from version 1 to version 2 without deleting the existing `docs` store.

## Design QA and screenshots

Canonical screenshots use a 390×844 viewport and live under `outputs/manual-booking-ux-v2/` in the Codex task output directory. The full contact sheet is `manual-booking-v2-contact-sheet.png`.

| # | Filename | State |
| --- | --- | --- |
| 01 | `01-category-selector-390x844.png` | Add Booking → Add Manually |
| 02 | `02-flight-empty-390x844.png` | Empty Flight form |
| 03 | `03-flight-partial-390x844.png` | Core Flight fields entered |
| 04 | `04-flight-airport-suggestions-390x844.png` | Offline airport suggestions visible |
| 05 | `05-flight-one-document-390x844.png` | One staged document |
| 06 | `06-flight-more-details-390x844.png` | More Details expanded |
| 07 | `07-hotel-390x844.png` | Hotel / Stay form |
| 08 | `08-train-390x844.png` | Train form |
| 09 | `09-car-rental-390x844.png` | Car Rental form |
| 10 | `10-restaurant-390x844.png` | Restaurant form |
| 11 | `11-activity-390x844.png` | Activity / Event form |
| 12 | `12-other-390x844.png` | Other form |
| 13 | `13-flight-attachment-state-390x844.png` | Attachment picker and local-storage status |
| 14 | `14-flight-multi-document-390x844.png` | Multiple staged documents |
| 15 | `15-flight-validation-390x844.png` | Inline validation and focused recovery |
| 16 | `16-focused-input-390x844.png` | Focused field with constrained mobile viewport |
| 17 | `17-resulting-timeline-390x844.png` | Booking rendered in Timeline after save |
| 18 | `18-booking-detail-linked-docs-390x844.png` | Booking Detail → Tickets & Documents |

Visual-only form states use the localhost-only `?preview=1` fixture and never call the API. The resulting Timeline and linked-document states are verified against a fresh temporary local D1 and fresh browser storage; they must not use production D1 or production user data.

Critical layouts are additionally checked at 360×800 and 430×932 for horizontal overflow, sticky-action visibility, file-row wrapping, keyboard reachability, console errors, and failed static assets. Preview and local-D1 evidence are reported separately so a representative fixture is never described as a persisted booking result.
