# Header action audit — local implementation

## Decision rule

The header shows an action only when it applies to the page currently open.
Every secondary screen keeps Back. Global actions do not appear on a page just
because they are available elsewhere in the app.

## Workspace headers

| Screen | Header actions | Reason |
| --- | --- | --- |
| All trips | Account, Create trip | It is the cross-trip home; this is a dedicated header. |
| Timeline | Add to trip, Menu | Main working surface for an active trip. |
| Planning | Add to trip, Menu | Main working surface for trip planning. |
| Neighborhood | Add place, Menu | Add is scoped to the open neighborhood; the menu holds edit and delete actions. |
| Bookings | Add booking, Menu | Booking inventory can create a directly related item. |

## Focused headers

The following keep only Back and any page-specific control already required by
their content. They do not show unrelated global `+` or Menu icons: create and
edit forms; booking, plan, traveler, and document details; Trip Options;
account; To-do; help; trip health; offline readiness; imports and review;
sync; collaboration and invitations; Trip Map; Weather; Currency; Travel eSIM;
and all missing, error, loading, authentication, first-run, and confirmation
screens.

This covers every app route rendered from `public/mobile-app.js`. Dialogs and
bottom sheets use their own close/action controls rather than inheriting page
header navigation.
