# Application inventory and coverage

Audit date: 2026-09-09. Canonical checkout: `header-fix-20260907`. The browser run used only deterministic preview fixtures and never touched production data. Dynamic object pages are covered by template and by materially different state fixtures; this is not a claim that every production record was opened.

## Coverage summary

- 59 route and form templates captured at 390 × 844.
- 47 additional role, empty, error, loading, long-content and data variants captured.
- 24 popup and confirmation variants captured; 16 distinct bottom-sheet types exist in source.
- 114 responsive matrix records cover 320, 360, 430, 768, 1024, 1440 and 1920 CSS-pixel widths plus 844 × 390 landscape.
- 116 distinct `data-action` hooks and 26 API route families were inventoried statically.
- Evidence root: `docs/audit/evidence/current/`.

## Route and template coverage

| ID | Screen/component | URL observed | Role | State | Check | Result | Evidence |
|---|---|---|---|---|---|---|---|
| UI-001 | account / account | `/account` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [account-top.png](evidence/current/after/account-top.png) |
| UI-002 | activity / plan | `/plans/vatican-museums` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [activity-top.png](evidence/current/after/activity-top.png) |
| UI-003 | add-booking / add-booking | `/bookings/add` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [add-booking-top.png](evidence/current/after/add-booking-top.png) |
| UI-004 | add / add-trip | `/add` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [add-top.png](evidence/current/after/add-top.png) |
| UI-005 | bookings / timeline | `/trips/rome-2026-2026-09-10` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [bookings-top.png](evidence/current/after/bookings-top.png) |
| UI-006 | checklist-form / form | `/before-you-go/new` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [checklist-form-top.png](evidence/current/after/checklist-form-top.png) |
| UI-007 | checklist / checklist | `/before-you-go` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [checklist-top.png](evidence/current/after/checklist-top.png) |
| UI-008 | collaboration / collaboration | `/collaboration` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [collaboration-top.png](evidence/current/after/collaboration-top.png) |
| UI-009 | currency / currency | `/currency` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [currency-top.png](evidence/current/after/currency-top.png) |
| UI-010 | day-plan-attraction / day-plan-form | `/day-plan/new/attraction` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [day-plan-attraction-top.png](evidence/current/after/day-plan-attraction-top.png) |
| UI-011 | day-plan-food_drink / day-plan-form | `/day-plan/new/food_drink` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [day-plan-food_drink-top.png](evidence/current/after/day-plan-food_drink-top.png) |
| UI-012 | day-plan-idea / day-plan-form | `/day-plan/new/idea` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [day-plan-idea-top.png](evidence/current/after/day-plan-idea-top.png) |
| UI-013 | day-plan-museum_culture / day-plan-form | `/day-plan/new/museum_culture` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [day-plan-museum_culture-top.png](evidence/current/after/day-plan-museum_culture-top.png) |
| UI-014 | day-plan / day-plan | `/day-plan` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [day-plan-top.png](evidence/current/after/day-plan-top.png) |
| UI-015 | documents / documents | `/documents` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [documents-top.png](evidence/current/after/documents-top.png) |
| UI-016 | email / booking-email-inbox | `/bookings/email-inbox` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [email-top.png](evidence/current/after/email-top.png) |
| UI-017 | esim / esim | `/esim` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [esim-top.png](evidence/current/after/esim-top.png) |
| UI-018 | flight / flight | `/flights/ly-383-tlv-fco` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [flight-top.png](evidence/current/after/flight-top.png) |
| UI-019 | form-activity / form | `/bookings/new/activity` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-activity-top.png](evidence/current/after/form-activity-top.png) |
| UI-020 | form-attraction / form | `/bookings/new/attraction` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-attraction-top.png](evidence/current/after/form-attraction-top.png) |
| UI-021 | form-bus / form | `/bookings/new/bus` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-bus-top.png](evidence/current/after/form-bus-top.png) |
| UI-022 | form-car-rental / form | `/bookings/new/car-rental` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-car-rental-top.png](evidence/current/after/form-car-rental-top.png) |
| UI-023 | form-cruise / form | `/bookings/new/cruise` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-cruise-top.png](evidence/current/after/form-cruise-top.png) |
| UI-024 | form-document / form | `/bookings/new/document` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [form-document-top.png](evidence/current/after/form-document-top.png) |
| UI-025 | form-event / form | `/bookings/new/event` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-event-top.png](evidence/current/after/form-event-top.png) |
| UI-026 | form-ferry / form | `/bookings/new/ferry` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-ferry-top.png](evidence/current/after/form-ferry-top.png) |
| UI-027 | form-flight / form | `/bookings/new/flight` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-flight-top.png](evidence/current/after/form-flight-top.png) |
| UI-028 | form-hotel / form | `/bookings/new/hotel` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-hotel-top.png](evidence/current/after/form-hotel-top.png) |
| UI-029 | form-insurance / form | `/bookings/new/insurance` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [form-insurance-top.png](evidence/current/after/form-insurance-top.png) |
| UI-030 | form-other / form | `/bookings/new/other` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [form-other-top.png](evidence/current/after/form-other-top.png) |
| UI-031 | form-parking / form | `/bookings/new/parking` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [form-parking-top.png](evidence/current/after/form-parking-top.png) |
| UI-032 | form-reservation / form | `/bookings/new/reservation` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [form-reservation-top.png](evidence/current/after/form-reservation-top.png) |
| UI-033 | form-restaurant / form | `/bookings/new/restaurant` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-restaurant-top.png](evidence/current/after/form-restaurant-top.png) |
| UI-034 | form-taxi / form | `/bookings/new/taxi` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-taxi-top.png](evidence/current/after/form-taxi-top.png) |
| UI-035 | form-tour / form | `/bookings/new/tour` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-tour-top.png](evidence/current/after/form-tour-top.png) |
| UI-036 | form-train / form | `/bookings/new/train` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-train-top.png](evidence/current/after/form-train-top.png) |
| UI-037 | form-transfer / form | `/bookings/new/transfer` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [form-transfer-top.png](evidence/current/after/form-transfer-top.png) |
| UI-038 | health / health | `/trip-health` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [health-top.png](evidence/current/after/health-top.png) |
| UI-039 | help / help | `/help` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [help-top.png](evidence/current/after/help-top.png) |
| UI-040 | hotel / hotel | `/hotels/hotel-artemide-hotel-artemide` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [hotel-top.png](evidence/current/after/hotel-top.png) |
| UI-041 | import-history / import-history | `/bookings/import/history` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [import-history-top.png](evidence/current/after/import-history-top.png) |
| UI-042 | import / import | `/bookings/import` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [import-top.png](evidence/current/after/import-top.png) |
| UI-043 | join / join | `/join/sample` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [join-top.png](evidence/current/after/join-top.png) |
| UI-044 | map / trip-map | `/trip-map` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [map-top.png](evidence/current/after/map-top.png) |
| UI-045 | museum-form / day-plan-form | `/day-plan/new/museum_culture` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [museum-form-top.png](evidence/current/after/museum-form-top.png) |
| UI-046 | neighborhood-form / collection-form | `/collections/new/neighborhood` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [neighborhood-form-top.png](evidence/current/after/neighborhood-form-top.png) |
| UI-047 | options / trip-options | `/trip-options` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [options-top.png](evidence/current/after/options-top.png) |
| UI-048 | ready / ready | `/ready-offline` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [ready-top.png](evidence/current/after/ready-top.png) |
| UI-049 | save-later / save-later | `/save-later` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [save-later-top.png](evidence/current/after/save-later-top.png) |
| UI-050 | sync / sync | `/pending-changes` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [sync-top.png](evidence/current/after/sync-top.png) |
| UI-051 | timeline / timeline | `/trips/rome-2026-2026-09-10` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [timeline-top.png](evidence/current/after/timeline-top.png) |
| UI-052 | train / train | `/trains/frecciarossa-9512-rome-florence` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [train-top.png](evidence/current/after/train-top.png) |
| UI-053 | traveler-form / form | `/travelers/new` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [traveler-form-top.png](evidence/current/after/traveler-form-top.png) |
| UI-054 | traveler / traveler | `/travelers/arthur` | Signed-in owner/editor | Normal + full scroll | Browser screenshot + DOM inventory | PASS | [traveler-top.png](evidence/current/after/traveler-top.png) |
| UI-055 | travelers / travelers | `/travelers` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [travelers-top.png](evidence/current/after/travelers-top.png) |
| UI-056 | trip-form / form | `/trips/new` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [trip-form-top.png](evidence/current/after/trip-form-top.png) |
| UI-057 | trips / trips | `/trips` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [trips-top.png](evidence/current/after/trips-top.png) |
| UI-058 | weather / weather | `/weather` | Signed-in owner/editor | Normal | Browser screenshot + DOM inventory | PASS | [weather-top.png](evidence/current/after/weather-top.png) |
| UI-059 | welcome / home | `/home` | Public guest | Normal | Browser screenshot + DOM inventory | PASS | [welcome-top.png](evidence/current/after/welcome-top.png) |

## Conditional and role coverage

| ID | Component | Role/state | Result | Evidence |
|---|---|---|---|---|
| ST-001 | Collaboration | Owner, editor, viewer, disabled, loading, error, empty | PASS | `evidence/current/states/` |
| ST-002 | Invite join | Valid, guest, paused, expired, busy, missing | PASS | `evidence/current/states/` |
| ST-003 | Timeline | Empty, offline, warning, now, no upcoming, legacy dates | PASS | `evidence/current/extra/` |
| ST-004 | Import review | Empty, candidate, duplicate | PASS | `evidence/current/states/` |
| ST-005 | Forms | 20 manual booking types and 11 day-plan types | PASS | `evidence/current/after/`, `evidence/current/extra/` |
| ST-006 | Missing objects | Plan and traveler missing states | PASS | `evidence/current/states/` |
| ST-007 | Destructive confirmations | Booking, trip, collection, stop, document, import, local data | PASS | `evidence/current/interaction/` |
| ST-008 | Account deletion confirmation | Signed-in production mutation | NOT_TESTED | Destructive real-account operation prohibited |
| ST-009 | Disabled live flights, AI, Gmail, R2, demo, ops | Feature flags off | NOT_APPLICABLE | Product configuration intentionally disables these integrations |
| ST-010 | Production email delivery and notification delivery | External side effect | BLOCKED | Real email/notifications prohibited by audit rules |

## Navigation notes

- `/bookings`, `/planning`, and `/local-guide` are retired aliases and redirect inside the app to their canonical owners. They are not separate product pages.
- Private routes are readable deep links but are deliberately excluded from Google indexing.
- Public indexable pages are `/`, `/privacy`, and `/terms`.
