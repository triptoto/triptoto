# UX writing and content-quality audit

Status: local audit, 8 September 2026. This work has not been deployed.

## Voice and terminology

Use short, direct sentences that name the outcome and the next action. Write in plain English, use sentence case, and avoid promises that the available data cannot support.

| Use | Meaning |
| --- | --- |
| Trip | The whole journey and its dates. |
| Timeline | The chronological view of scheduled bookings and plans. |
| Day Plan | An activity scheduled on a trip day. |
| Neighborhood | A group of nearby places that can appear as one timeline item. |
| Booking | Travel already reserved. |
| Save for Later | An unscheduled idea. |
| Ready offline | A file verified and stored on this phone. |
| Scheduled data | Booking data supplied by the itinerary, not live operational status. |

## Coverage and findings

| Surface or state | Review result | Action |
| --- | --- | --- |
| App header, global menu, page titles, navigation labels | Clear, specific labels and consistent title case. | Retained. |
| All Trips, current trip, Timeline | `Trip`, `Timeline`, date, booking, and status language are distinct. | Retained. |
| Bookings and booking detail | `Scheduled data`, `Confirmed`, and `Ready offline` are deliberately separate. `Not assigned` accurately represents unknown terminal, gate, and seat values. | Retained. |
| New trip review | The former language implied that creation had already assembled an itinerary. | Rewritten as a review step and optional planning tools. |
| New trip success | “Your trip is ready” could imply bookings, documents, and plans had been created. | Changed to `Trip created`; the next step now says what the user can do. |
| New trip completion | The confirmation could sit over the Add a booking page, and preview mode skipped it when another trip existed. | Every new trip now opens its confirmation over its own Timeline. |
| Onboarding and Trip Map | “Everything” implied that all trip content appears in one view. Saved ideas and map-eligible places have different destinations. | Replaced the two absolute claims with scope-accurate descriptions. |
| Neighborhood planning | The original intro used `Plan your days` while this page only manages neighborhoods. | Made the scope explicit and shortened the empty-state wording. |
| Save for Later and Add to plan | Terms distinguish unscheduled ideas from scheduled items. | Retained. |
| Forms, date picker, validation and saving | Required labels, field-level validation, loading label, and save outcomes state the action and recovery path. | Retained. |
| Import, documents and offline state | The copy distinguishes local storage, verification, rejected imports, and retry states. | Retained. |
| Collaboration, account and sign-in recovery | Copy explains read-only access, pending invitations, secure handoff, and preserved device data. | Retained. |
| Weather, maps, search and external links | Empty/error states name the unavailable service and offer an appropriate retry or manual path. Partner links identify their destination and disclose commission. | Retained. |
| Destructive actions, sheets, toasts, tooltips and accessibility labels | Destructive copy names deletion; transient feedback names the completed action; controls have accessible labels. | Retained. |

## Changed copy

| Before | After | Why |
| --- | --- | --- |
| Bring your trip together | Check your trip details | Matches the actual review step. |
| Keep your bookings and travel details in one clear timeline. | You can change these details later. | Does not suggest content already exists. |
| Anything else you need? | Plan the rest of your trip | Makes the optional section’s purpose explicit. |
| Still haven't booked the flights? | Find a flight | Shorter, action-led, and neutral. |
| Still looking for a place to stay? | Find a place to stay | Shorter, action-led, and neutral. |
| Need an eSIM? | Get an eSIM | Shorter, action-led, and neutral. |
| Your trip is ready! | Trip created | Accurate for an empty newly created trip. |
| Let the adventure begin. | Add bookings and plans whenever you’re ready. | Gives a truthful next step. |
| Open trip | Open timeline | Names the destination precisely. |
| Everything becomes one Timeline | Bookings and plans appear on your Timeline | Does not imply that unscheduled ideas appear there. |
| Everything from your bookings, organized by day. | Places from your trip, organized by day. | Names the content actually shown by the map. |

## Open product questions

1. The Planning screen remains a separate route for Neighborhoods. Its revised copy now explains that scope, but whether it should remain a top-level destination is a product-navigation decision rather than a wording change.
2. External partners are labelled by destination, but their current availability, market coverage, and commission terms need an owner-confirmed review before any stronger marketing claims are made.
3. Native browser, Google sign-in, map, airline, Booking.com, Aviasales, and eSIM interfaces are outside Tripto’s copy surface. Their wording was not changed.

## Verification to complete before release

- Run the UI and route contracts after the source changes.
- Open the new-trip review and created-trip sheet in a 320 px, 390 px, and 430 px mobile viewport.
- Confirm that the final create action still creates exactly one trip and that `Open timeline` reaches that trip’s timeline.
- Recheck the updated Planning page with scheduled and unscheduled neighborhoods.

## Route and window inventory reviewed

The source-owned route matrix contains 74 variants: Timeline; add menu; booking, document, offline, health, checklist, account, help, collaboration, map, weather, currency, eSIM, import, sync, traveler, Planning, Neighborhood, Save for Later, Day Plan, booking/detail and form variants; new-trip; Trips; Privacy; and Terms.

The app-controlled modal inventory contains navigation, add, document, trip switcher, onboarding tour, help, notifications, manual booking picker, booking management, move booking, date range, trip review, trip created, booking-email trip assignment, sharing, member actions, currency picker, Neighborhood-stop actions, and idea actions. Typed destructive confirmations and field validation messages are separately covered by the form and recovery review above.
