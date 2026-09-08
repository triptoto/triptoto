# Tripto design-audit coverage

Audit date: 2026-09-08. Local checkout: `fix/keyboard-header-20260907`, baseline `196b25c`. **No production deployment.**

## Result and counting rules

The inventory contains **92 surface families**: **86 VERIFIED**, **2 INSPECTED with incomplete integration evidence**, **2 BLOCKED for live authentication**, and **2 NOT APPLICABLE**. No discovered family is left without a disposition. This is not a claim that every possible data permutation or external transaction was exercised.

VERIFIED means the named **local visual state** was rendered, scrolled and inspected, with its applicable local controls opened. It does not certify production API writes, authentication, payments, email delivery, every browser, or every viewport for every page. BLOCKED authentication rows still have app-controlled fallback UI evidence. Parameterized forms, separate popups, roles and additional states are listed individually in [the evidence inventory](evidence-index.md); this family table is a navigation summary, not a substitute for that inventory.

**20 local corrections** are described in [findings](findings.md). “Fixed” is a change-level count, not a fabricated count of independent bugs per affected route.

## Families and direct evidence

| ID | Route / parent | Surface and entry | State, data, or role | Viewports / evidence | Issues | Status |
| --- | --- | --- | --- | --- | --- | --- |
| HOME.WELCOME | `/`, `/home` | Welcome / first-run landing | guest and no selected trip | 390×844; [evidence](evidence/2026-09-08/after/welcome.json) | DA-13 | VERIFIED |
| HOME.AUTHENTICATING | Welcome | Transient Google-auth handoff | Google challenge state | 390×844; [evidence](evidence/2026-09-08/remaining/auth-pending.json) | DA-13 | VERIFIED |
| HOME.GOOGLE-RECOVERY | Google callback | Signed credential with lost route state | Recovery UI fixture inspected; real signed Google callback unavailable locally | 390×844; [evidence](evidence/2026-09-08/remaining/auth-expired.json) | DA-13 | BLOCKED |
| HOME.TOUR | Welcome, Account | Take the tour sheet | guest and account | 390×844; [evidence](evidence/2026-09-08/remaining/welcome-tour.json) | DA-13 | VERIFIED |
| TRIPS.LIST | `/trips` | Trips list | current, upcoming, and past trips | 390×844; [evidence](evidence/2026-09-08/after/trips.json) | DA-01, DA-10 | VERIFIED |
| TRIPS.FILTER | Trips list | Current / upcoming / past filter | all lifecycle groups | 390×844; [evidence](evidence/2026-09-08/completion/variants/trips-current.json) | DA-01, DA-10 | VERIFIED |
| TRIPS.ROW-ACTION | Trips list | Swipe / delete affordance | disposable local trip only | 390×844; [evidence](evidence/2026-09-08/flows/trip-delete-confirm.json) | DA-01, DA-10 | VERIFIED |
| TRIPS.EMPTY | Trips list | Empty state | no trips | 390×844; [evidence](evidence/2026-09-08/extra/trip-empty.json) | DA-01, DA-10 | VERIFIED |
| TIMELINE.POPULATED | `/timeline`, `/trips/:slug` | Main timeline | populated upcoming trip | 390×844; [evidence](evidence/2026-09-08/after/timeline.json) | DA-01, DA-03 | VERIFIED |
| TIMELINE.EMPTY | Timeline | Empty setup state | trip with no bookings | 390×844; [evidence](evidence/2026-09-08/final/timeline-empty.json) | DA-01, DA-03 | VERIFIED |
| TIMELINE.PRE-TRIP | Timeline | Future trip without preparation card | Preparation card removed at user request after the audit | 320/390/430px; [latest evidence](evidence/2026-09-08/pretrip-removal/timeline-390.json) | User-requested removal | VERIFIED |
| TIMELINE.ACTIVE | Timeline | NEXT / active itinerary state | current day and booking | 390×844; [evidence](evidence/2026-09-08/extra/timeline-now.json) | DA-01, DA-03 | VERIFIED |
| TIMELINE.DAY-TABS | Timeline | Day segmented control / overflow | multi-day trip | 390×844; [evidence](evidence/2026-09-08/completion/variants/timeline-day-3.json) | DA-01, DA-03 | VERIFIED |
| TIMELINE.NOTIFICATIONS | Timeline | Notifications sheet | notifications present and empty | 390×844; [evidence](evidence/2026-09-08/remaining/notifications-populated.json) | DA-01, DA-03 | VERIFIED |
| TIMELINE.TRIP-SWITCHER | Timeline, Account | Trip selector sheet | 3+ trips | 390×844; [evidence](evidence/2026-09-08/interaction/trip-switch.json) | DA-01, DA-03 | VERIFIED |
| TIMELINE.ADD-MENU | Bottom navigation | Main Add sheet | selected trip | 390×844; [evidence](evidence/2026-09-08/remaining/add-hub.json) | DA-01, DA-03 | VERIFIED |
| TRIP.CREATE | `/trips/new` | Create trip form | blank, valid, validation, long destination | 390×844; [evidence](evidence/2026-09-08/after/trip-form.json) | DA-04, DA-05 | VERIFIED |
| TRIP.EDIT | Trip options | Edit trip form | existing trip | 390×844; [evidence](evidence/2026-09-08/states/trip-edit.json) | DA-04, DA-05 | VERIFIED |
| TRIP.DESTINATION-PICKER | Create/edit trip | Full-screen destination search and suggestions | typeahead / no results | 390×844; [evidence](evidence/2026-09-08/flows/destination-results.json) | DA-04, DA-05 | VERIFIED |
| TRIP.DATE-RANGE | Create/edit trip | Date-range picker | valid range, bounds, keyboard focus | 390×844; [evidence](evidence/2026-09-08/flows/calendar-selected.json) | DA-04, DA-05 | VERIFIED |
| TRIP.SETUP-READY | Create trip | Post-date plan setup sheet | successful dates | 390×844; [evidence](evidence/2026-09-08/flows/trip-setup.json) | DA-04, DA-05 | VERIFIED |
| ADD.BOOKING | `/bookings/add` | Add Booking choice screen | selected trip | 390×844; [evidence](evidence/2026-09-08/after/add-booking.json) | DA-04, DA-05 | VERIFIED |
| ADD.MANUAL-PICKER | Add Booking | Manual booking type sheet | Legacy renderer exists, but no visible trigger in this build; booking choices live on Add Booking | No live app-owned trigger / native boundary | DA-04, DA-05 | NOT APPLICABLE |
| ADD.MANUAL-FLIGHT | `/bookings/new/flight` | Flight form | valid, invalid, long airport names | 390×844; [evidence](evidence/2026-09-08/after/form-flight.json) | DA-04, DA-05 | VERIFIED |
| ADD.MANUAL-STAY | `/bookings/new/hotel` | Stay form | valid, invalid, long property name | 390×844; [evidence](evidence/2026-09-08/after/form-hotel.json) | DA-04, DA-05 | VERIFIED |
| ADD.MANUAL-TRAIN | `/bookings/new/train` | Train / ferry form | valid, invalid | 390×844; [evidence](evidence/2026-09-08/after/form-train.json) | DA-04, DA-05 | VERIFIED |
| ADD.MANUAL-ACTIVITY | `/bookings/new/activity` | Activity / reservation form | valid, invalid, multiline notes | 390×844; [evidence](evidence/2026-09-08/after/form-activity.json) | DA-04, DA-05 | VERIFIED |
| ADD.MANUAL-DOCUMENTS | Manual forms | Attachments, preview, retry and remove | local disposable file boundary | 390×844; [evidence](evidence/2026-09-08/final/document-return.json) | DA-04, DA-05 | VERIFIED |
| DAY-PLAN.LIST | `/day-plan` | Day Plan type list | selected trip | 390×844; [evidence](evidence/2026-09-08/after/day-plan.json) | DA-04 | VERIFIED |
| DAY-PLAN.FORM | `/day-plan/new/:type`, `/day-plan/item/:id` | Create and edit day-plan form | dated and undated activity | 390×844; [evidence](evidence/2026-09-08/completion/variants/day-edit-museum_culture.json) | DA-04 | VERIFIED |
| SAVE-LATER.LIST | `/save-later` | Ideas list and filter | unscheduled and planned ideas | 390×844; [evidence](evidence/2026-09-08/states/ideas.json) | DA-04, DA-07 | VERIFIED |
| SAVE-LATER.IDEA-SHEET | Save for Later | Idea action sheet | editable and view-only ideas | 390×844; [evidence](evidence/2026-09-08/interaction/idea-menu.json) | DA-04, DA-07 | VERIFIED |
| SAVE-LATER.ADD-TO-PLAN | `/plan-idea/:id` | Select a trip day / optional time | trip with fixed dates | 390×844; [evidence](evidence/2026-09-08/states/idea-day-picker.json) | DA-04, DA-07 | VERIFIED |
| PLANNING.OVERVIEW | `/planning` | Planning collections overview | on-timeline and unscheduled collections | 390×844; [evidence](evidence/2026-09-08/states/planning-populated.json) | DA-01 | VERIFIED |
| COLLECTION.DETAIL | `/collections/:id` | Neighborhood collection / compact timeline | 0, 1, many, long stops | 390×844; [evidence](evidence/2026-09-08/states/collection-long.json) | DA-04, DA-07 | VERIFIED |
| COLLECTION.STOP-ACTION | Neighborhood collection | Place action sheet | selected stop, actions and destructive row | 390×844; [evidence](evidence/2026-09-08/interaction/stop-menu.json) | DA-04, DA-07 | VERIFIED |
| COLLECTION.CREATE | `/collections/new/:type` | Create Neighborhood / Day Trip form | blank, date omitted, date chosen | 390×844; [evidence](evidence/2026-09-08/after/neighborhood-form.json) | DA-04, DA-07 | VERIFIED |
| COLLECTION.EDIT | `/collections/:id/edit` | Edit collection form | existing collection | 390×844; [evidence](evidence/2026-09-08/states/collection-edit.json) | DA-04, DA-07 | VERIFIED |
| COLLECTION.ADD-PLACE | `/collections/:id/add-place` | Add / edit place form | blank, validation, long fields | 320–430px; [latest](evidence/2026-09-08/final/stop-form-320.json) | DA-04, DA-07 | VERIFIED |
| COLLECTION.DELETE | Collection detail | Collection and stop deletion confirmation | disposable preview item | 390×844; [evidence](evidence/2026-09-08/interaction/collection-delete.json) | DA-04, DA-07 | VERIFIED |
| BOOKINGS.LIST | `/bookings` | Booking list | multiple categories and empty state | 390×844; [evidence](evidence/2026-09-08/after/bookings.json) | DA-01 | VERIFIED |
| BOOKINGS.FILTER | Bookings list | Booking category filter | populated categories | 390×844; [evidence](evidence/2026-09-08/completion/variants/bookings-transport.json) | DA-01 | VERIFIED |
| BOOKING.MANAGE | Booking detail / timeline | Manage booking action sheet | editable booking | 390×844; [evidence](evidence/2026-09-08/interaction/manage-booking.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.MOVE | Booking detail / timeline | Move booking to day sheet | trip date range | 390×844; [evidence](evidence/2026-09-08/interaction/move-booking.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.FLIGHT | `/flights/:id` | Flight detail and disclosure | confirmed and missing record | 390×844; [evidence](evidence/2026-09-08/extra/flight-expanded.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.HOTEL | `/hotels/:id` | Hotel detail and directions | confirmed and missing record | 390×844; [evidence](evidence/2026-09-08/after/hotel.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.TRAIN | `/trains/:id` | Train / ferry detail | confirmed and missing record | 390×844; [evidence](evidence/2026-09-08/after/train.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.PLAN | `/plans/:id` | Activity / reservation detail | confirmed and missing record | 390×844; [evidence](evidence/2026-09-08/after/activity.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.DETAIL-DOCS | Booking detail | Documents, copy, note edit, share | local document and notes | 390×844; [evidence](evidence/2026-09-08/flows/note-activity.json) | DA-06, DA-07 | VERIFIED |
| BOOKING.DELETE | Booking detail | Delete confirmation | disposable preview booking | 390×844; [evidence](evidence/2026-09-08/interaction/delete-booking.json) | DA-06, DA-07 | VERIFIED |
| DOCUMENTS.LIST | `/documents` | Trip documents list | verified, unverified, empty | 390×844; [evidence](evidence/2026-09-08/after/documents.json) | DA-01, DA-20 | VERIFIED |
| DOCUMENTS.ACTIONS | Documents | Add-document sheet and document action choices | local preview data | 390×844; [evidence](evidence/2026-09-08/states/document-sheet.json) | DA-01, DA-20 | VERIFIED |
| DOCUMENTS.VIEWER | Documents | Document viewer and close/focus return | local supported file only | 390×844; [evidence](evidence/2026-09-08/final/document-viewer.json) | DA-01, DA-20 | VERIFIED |
| DOCUMENTS.DELETE | Documents | Remove-document confirmation | disposable local document only | 390×844; [evidence](evidence/2026-09-08/interaction/delete-document.json) | DA-01, DA-20 | VERIFIED |
| IMPORT.UPLOAD | `/bookings/import` | Upload / manual import | Upload UI and real file staging inspected; recognition service retry/result not end-to-end verified | 390×844; [evidence](evidence/2026-09-08/after/import.json) | DA-12 | INSPECTED |
| IMPORT.REVIEW | `/bookings/import/review/:id` | Extracted booking review | known preview candidate, duplicate, error | 390×844; [evidence](evidence/2026-09-08/remaining/import-final.json) | DA-12 | VERIFIED |
| IMPORT.HISTORY | `/bookings/import/history` | Import history and remove confirmation | empty and populated history | 390×844; [evidence](evidence/2026-09-08/after/import-history.json) | DA-12 | VERIFIED |
| EMAIL.INBOX | `/bookings/email-inbox` | Forwarded-booking inbox | guest, signed-in, actionable email | 390×844; [evidence](evidence/2026-09-08/states/email-populated.json) | DA-01, DA-07 | VERIFIED |
| EMAIL.TRIP-PICKER | Email inbox | Choose destination trip sheet | ambiguous incoming booking | 390×844; [evidence](evidence/2026-09-08/states/email-trip-picker.json) | DA-01, DA-07 | VERIFIED |
| OFFLINE.READY | `/ready-offline` | Offline readiness and download management | saved and empty data | 390×844; [evidence](evidence/2026-09-08/after/ready.json) | DA-16 | VERIFIED |
| OFFLINE.HEALTH | `/trip-health` | Trip Health summary and issue details | healthy and needs-attention data | 390×844; [evidence](evidence/2026-09-08/extra/health-issues.json) | DA-16 | VERIFIED |
| OFFLINE.SYNC | `/pending-changes` | Pending changes and conflict recovery | none, pending, conflict | 390×844; [evidence](evidence/2026-09-08/extra/sync-conflict.json) | DA-16 | VERIFIED |
| CHECKLIST.LIST | `/before-you-go` | Checklist, categories and progress | empty, populated, complete | 390×844; [evidence](evidence/2026-09-08/remaining/checklist-complete.json) | DA-01 | VERIFIED |
| CHECKLIST.EDIT | Checklist | Add, inline edit, delete and validation | disposable local item | 390×844; [evidence](evidence/2026-09-08/remaining/checklist-edit.json) | DA-01 | VERIFIED |
| TRAVELERS.LIST | `/travelers` | Travelers list | empty and multiple travelers | 390×844; [evidence](evidence/2026-09-08/after/travelers.json) | DA-16 | VERIFIED |
| TRAVELERS.DETAIL | `/travelers/:id` | Traveler detail / checklist | existing and missing traveler | 390×844; [evidence](evidence/2026-09-08/states/missing-traveler.json) | DA-16 | VERIFIED |
| TRAVELERS.FORM | `/travelers/new` | Add / edit traveler form | validation and long name | 390×844; [evidence](evidence/2026-09-08/states/traveler-edit.json) | DA-16 | VERIFIED |
| OPTIONS.HOME | `/trip-options` | Trip Options hub | map-eligible and map-ineligible trip | 390×844; [evidence](evidence/2026-09-08/after/options.json) | DA-02 | VERIFIED |
| OPTIONS.WEATHER | `/weather` | Weather, place chips and refresh state | forecast, loading, empty, offline | 390×844; [evidence](evidence/2026-09-08/final/weather-fixture-saved.json) | DA-02 | VERIFIED |
| OPTIONS.CURRENCY | `/currency` | Currency converter and rate states | normal, large amount, error | 320–430px; [latest](evidence/2026-09-08/final/currency-unavailable-320.json) | DA-02 | VERIFIED |
| OPTIONS.CURRENCY-PICKER | Currency | Currency picker sheet | from/to selection | 390×844; [evidence](evidence/2026-09-08/interaction/currency-picker.json) | DA-02 | VERIFIED |
| OPTIONS.ESIM | `/esim` | eSIM offer and support details | normal and unavailable | 390×844; [evidence](evidence/2026-09-08/after/esim.json) | DA-02 | VERIFIED |
| OPTIONS.MAP | `/trip-map` | Trip Map, day filter and directions | 2+ locations and insufficient places | 390×844; [evidence](evidence/2026-09-08/remaining/map-no-location.json) | DA-02 | VERIFIED |
| OPTIONS.DRIVER | Hotel / directions | Show to Driver full-screen state | property with location | 390×844; [evidence](evidence/2026-09-08/states/driver-final.json) | DA-02 | VERIFIED |
| COLLAB.GUEST | `/collaboration` | Plan Together guest sign-in gate | guest user | 390×844; [evidence](evidence/2026-09-08/after/collaboration.json) | DA-08, DA-11 | VERIFIED |
| COLLAB.MEMBERS | Collaboration | Members and roles | signed-in owner / editor / viewer | 390×844; [evidence](evidence/2026-09-08/states/collab-owner.json) | DA-08, DA-11 | VERIFIED |
| COLLAB.INVITE | Collaboration | Invite role picker and generated-link state | safe local state only | 390×844; [evidence](evidence/2026-09-08/states/share-link-ready.json) | DA-08, DA-11 | VERIFIED |
| COLLAB.MEMBER-ACTIONS | Collaboration | Member role / remove action sheet | local owner data | 390×844; [evidence](evidence/2026-09-08/interaction/member-sheet.json) | DA-08, DA-11 | VERIFIED |
| COLLAB.JOIN | `/join/:token` | Invitation join state | missing, valid, expired and guest states | 390×844; [evidence](evidence/2026-09-08/states/join-valid.json) | DA-08, DA-11 | VERIFIED |
| ACCOUNT.HOME | `/account` | Profile, account shortcuts and data controls | guest and signed-in state | 390×844; [evidence](evidence/2026-09-08/remaining/account-signed-in.json) | DA-08, DA-09 | VERIFIED |
| ACCOUNT.AUTH | Account | Google sign-in control and error state | Account/rejection UI inspected; external Google sign-in blocked | 390×844; [evidence](evidence/2026-09-08/remaining/session-rejected.json) | DA-08, DA-09 | BLOCKED |
| ACCOUNT.DELETE | Account | Remove local data / delete account confirmations | Real entry blocked by unavailable local preview API; exact typed-confirm component checked in isolation, cancellation only | 390×844; [evidence](evidence/2026-09-08/flows/typed-confirm-component.json) | DA-08, DA-09 | INSPECTED |
| HELP.HOME | `/help` | Help, FAQ expansion and support links | collapsed and expanded FAQ | 390×844; [evidence](evidence/2026-09-08/final/faq-empty.json) | DA-17 | VERIFIED |
| HELP.SHEET | Timeline / Account | Help actions sheet | guest and account | 390×844; [evidence](evidence/2026-09-08/interaction/help-sheet.json) | DA-17 | VERIFIED |
| NOTICE.TOAST | Any route | Success, warning and error toast | controlled preview feedback | 390×844; [evidence](evidence/2026-09-08/remaining/toast-alert.json) | DA-09 | VERIFIED |
| NOTICE.OFFLINE | Any route | Offline / stale data banner | forced offline preview state | 390×844; [evidence](evidence/2026-09-08/extra/offline.json) | DA-09 | VERIFIED |
| SYSTEM.LOADING | App shell | Loading state | controlled preview state | 390×844; [evidence](evidence/2026-09-08/extra/loading.json) | DA-14 | VERIFIED |
| SYSTEM.ERROR | App shell | Error and retry state | controlled preview state | 390×844; [evidence](evidence/2026-09-08/extra/error.json) | DA-14 | VERIFIED |
| SYSTEM.NOT-FOUND | Detail routes | Missing plan / booking / traveler recovery | nonexistent IDs | 390×844; [evidence](evidence/2026-09-08/final/missing-390.json) | DA-14 | VERIFIED |
| STATIC.PRIVACY | `/privacy.html` | Privacy page | static page | 390×844; [evidence](evidence/2026-09-08/extra/privacy.json) | DA-15 | VERIFIED |
| STATIC.TERMS | `/terms.html` | Terms page | static page | 390×844; [evidence](evidence/2026-09-08/extra/terms.json) | DA-15 | VERIFIED |
| PWA.INSTALL | Browser install prompt | OS / browser-controlled installation UI | native boundary | No live app-owned trigger / native boundary | — | NOT APPLICABLE |

## Cross-cutting viewport and accessibility matrix

| ID | Check | Evidence / limits | Status |
| --- | --- | --- | --- |
| MATRIX.MOBILE | Actual 320×568, 360×740, 390×844, 430×932 CSS viewports | [84-case matrix](evidence/2026-09-08/matrix/results-0-6.json), [latest responsive regressions](evidence/2026-09-08/final/results-responsive.json). Four phone widths repeat the final stop-form/currency fixes. | VERIFIED |
| MATRIX.LANDSCAPE | 844×390 | Fourteen representative page/form/overlay states; internal popup scrolling and reachable close/actions. | VERIFIED |
| MATRIX.TABLET | 768×1024 | Fourteen representative states, not every route. | VERIFIED |
| MATRIX.DESKTOP | 1024×768 | Fourteen representative states in the application's responsive shell. | VERIFIED |
| MATRIX.ZOOM | Actual browser zoom 200% | Isolated headless Chrome did not apply browser-profile zoom (reported scale/DPR remained 1). [512×340 reflow](evidence/2026-09-08/completion/variants/reflow-popup.json) is supplemental only, not a substitute. | BLOCKED |
| MATRIX.KEYBOARD | Physical iPhone Safari keyboard / browser chrome | No connected iPhone Safari target. Desktop Tab/Escape/focus and the app viewport contract passed; they do not prove physical iOS keyboard behavior. | BLOCKED |
| MATRIX.RTL | Hebrew/Arabic content in the existing LTR product | [Long mixed-direction collection content](evidence/2026-09-08/remaining/collection-rtl-content.json). Full translated RTL application is not implemented and not claimed. | VERIFIED |

## State and interaction coverage

- Nineteen manual **create** types: flight, hotel, train, ferry, bus, cruise, car rental, transfer, taxi, parking, restaurant, tour, activity, attraction, event, insurance, other, reservation, document. Eighteen corresponding **edit** types; document is add-only here. Expanded edit panels are explicitly asserted in [completion results](evidence/2026-09-08/completion/regression/results-edit.json).
- Eleven day-plan/idea create and edit variants, plus Neighborhood create/edit, place create/edit, trip and traveler create/edit, checklist edit and validation. [Variant run](evidence/2026-09-08/completion/variants/results.json).
- Neighborhood empty/populated/long-text/viewer, Save for Later idea and planned filters, day selection with and without trip dates; no-trip entry states.
- Plan Together guest, owner, editor, viewer, empty, loading, disabled and error; role picker and link-ready/busy sheet; member actions; remove/transfer/leave confirmations; invitation valid, guest, missing, expired, paused and busy.
- Loading/error/offline/empty/pending-conflict, missing flight/hotel/train/plan/traveler, weather loading/offline/saved, currency unavailable/loading/error/large value, FAQ collapsed/expanded/all-expanded/no-match, notification empty/populated, success/error notices.
- Real existing UI triggers opened the action sheets and dialogs. Tab was cycled 18–20 times for tested app overlays; Escape, focus containment and background locking were checked. The document viewer additionally has ten explicit return/focus/history/form-preservation checks.
- Date range selection, destination typeahead/no-match, round-trip return-time disclosure, four actual timeline day tabs, trip filters, booking filters, swipe-to-delete **cancel**, dirty-form discard **cancel**, inline notes **cancel** and local document staging/view/remove were exercised.

## Important boundaries and follow-ups

1. Google sign-in and the real account-deletion preview endpoint need an authorized integration environment. Typed DELETE behavior was tested using the exact production component in an isolated browser fixture, without deleting an account.
2. Upload parsing/retry against the recognition service, production persistence, real invitation sends/acceptance and remote role changes were not executed. Preview role/error/loading states verify rendering, not server behavior.
3. Native selects, time/date controls, file dialog, share dialog, browser install UI and PDF-plugin internals belong to the browser/OS. A local PNG was used for the verified attachment viewer; PDF plugin keyboard traversal needs its own platform check.
4. Actual browser zoom and physical iPhone keyboard checks remain open as stated above. No “full release GO” is asserted from this audit.
5. Long wrapping text was inspected. Arbitrarily large free-text collection context can exceed the fixed context region; that extreme background layout was not certified by the long confirmation-dialog check. The normal and roughly 70-character title cases were inspected separately.
6. Historical failed harness attempts remain in the evidence folder. See [methodology](methodology.md) for superseded runs, fixture corrections and the distinction between app failures and harness failures.
