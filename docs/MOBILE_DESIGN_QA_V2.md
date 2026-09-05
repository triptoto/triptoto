# tripto.to Product V2 — Mobile Design QA Gate

Status: **PASS** for product review. This is a prototype QA result, not approval to begin production implementation.

## Scope and method

The full Product V2 prototype was reviewed as one mobile system at the primary 390 × 844 viewport and checked at 360 × 800, 375 × 812, 393 × 852, and 430 × 932. Review combined rendered screenshots, interaction checks, measured geometry, responsive CSS inspection, runtime tests, and keyboard/safe-area behavior supplied by the protected mobile prototype runtime.

The prototype uses synthetic travel data only and does not connect to production APIs or persist preview data.

## Definitive screen inventory

1. Welcome
2. Take a Tour sheet
3. Authentication / Google sign-in state
4. Create Trip
5. Date selection sheet
6. Add Booking
7. Upload Booking
8. Forward Confirmation
9. Add Manually category selector and search
10. Manual Flight form
11. Manual Hotel / Stay form
12. Manual Activity / Event form
13. Timeline — first booking
14. Timeline — populated
15. Timeline — Before Trip
16. Timeline — During Trip / NEXT
17. Timeline — Needs Attention
18. Booking Detail
19. Trip selector sheet
20. Central + menu
21. Create New Trip
22. Account
23. Past Trips
24. Booking-level Tickets & Documents
25. Trip-level Tickets & Documents
26. Multiple Documents
27. Unlinked Document
28. Link Document to Booking
29. Document Available Offline
30. Device-local Document
31. Loading
32. Empty trip
33. Error / recovery
34. Offline
35. Confirmation dialog
36. Destructive confirmation
37. Upload selected / review state

The category search is part of Add Manually rather than a duplicate screen, so the 38 requested inventory entries are represented by 37 canonical rendered states.

## Viewport matrix

| Viewport | Role | Result |
|---|---|---|
| 360 × 800 | narrow iPhone / compact height | PASS |
| 375 × 812 | common iPhone | PASS |
| 390 × 844 | canonical visual source | PASS |
| 393 × 852 | large iPhone | PASS |
| 430 × 932 | large phone / Android comparison | PASS |

The protected runtime was checked with iPhone-style status/home-indicator geometry and Android navigation-area behavior. No horizontal document overflow or control outside the visible phone surface was found.

## Design system observations

- Product surfaces use white `#FFFFFF`, cool concrete `#F1F3F5`, silver slate borders `#CED4DA`, asphalt grey icons and secondary text `#495057`, and jet black `#111215`.
- Trip and booking titles and all interface text use the native Apple system
  stack with standard fallbacks. Provider-rendered Google Identity controls,
  icons, and protected device chrome retain their provider/runtime typography.
- Jet black is reserved for primary actions and primary text; grey hierarchy carries secondary states.
- White surfaces are the default, with cool-concrete card fill and silver separators.
- The component language is consistent: 14–20px radii, subtle 1px borders, restrained shadows, and flat Timeline rows.

## Button and touch-target findings

- Primary actions are 56px high; secondary rows and icon controls meet or exceed 44px.
- The central + is 54px, optically centered between Trip and Account, and clears the device safe area.
- Welcome legal controls were initially 16px high. They were corrected to 44px touch targets without changing their visual weight.
- Primary/secondary hierarchy is clear on Welcome, Add Booking, document recovery, forms, and dialogs.
- Keyboard-aware text fields and the protected runtime keep form actions reachable when the simulated keyboard is shown.
- Focus-visible treatment uses a 3px jet-black outline and does not rely on color alone.

## Icon inventory and consistency

The application uses the locally bundled Phosphor family for Flight, Hotel, Train, Car, Restaurant, Ticket, Document, Calendar, Location, User, Back, Close, Chevron, Warning, Check, Edit, Delete, Alerts, and Plus concepts. Regular weight is the normal state and Fill is the selected/current state. Custom SVG remains limited to weather and destination/branded illustration work.

No second general-purpose icon family is loaded. Icon containers, optical sizes, label gaps, and selected-state treatment remain consistent.

## Spacing and typography

- The app follows a disciplined 4/8/12/16/20/24/32 spacing rhythm.
- Headers use consistent 20px side margins and 44px action zones.
- Display, route, screen, section, body, metadata, and label roles use the shared
  52 / 40 / 28 / 20 / 16 / 13 / 11px hierarchy.
- Form text remains 16px or larger, preventing iOS input zoom.
- Two-column booking fields collapse on narrow viewports to prevent cramped labels and controls.
- Long-content review found no critical clipping; raw document filenames are deliberately subordinate to document type.

## Forms and keyboard

- Create Trip, Manual Flight, Hotel / Stay, Activity / Event, and category search were audited.
- Labels remain associated with their fields; disabled actions are visibly disabled.
- Date controls remain large, readable, and use the native-feeling range sheet.
- Search was corrected from a visual placeholder to a real labeled input.
- At 360px, field pairs collapse instead of shrinking text.
- The prototype runtime’s keyboard tests confirm vertical handoff, keyboard dismissal, and footer positioning on iPhone and Android geometry.

## Timeline QA

- Chronology is immediately understandable through date groups, aligned time columns, a single rail, consistent event icons, and quieter metadata.
- Only one primary contextual card appears at a time.
- Priority is correct: Needs Attention, NEXT, Before You Go, then informational confirmation.
- Sparse, populated, pre-trip, during-trip, attention, and empty states were reviewed.
- The central + and bottom navigation do not cover Timeline content.
- Result: **PASS**. The Timeline reads as a travel itinerary, not a dashboard or project tracker.

## Tickets & Documents QA

- Booking-level and trip-level views preserve booking context and journey order.
- Document type is stronger than raw filename.
- Available offline, stored on device, device-local, and unlinked states are distinct in both text and icon treatment.
- Uncertain files use Needs Attention and explicit linking; the prototype never guesses.
- Documents remain contextual rather than becoming a generic file manager.
- Result: **PASS**.

## Sheet, modal, layering, and safe-area QA

- Take a Tour, date range, trip selector, + menu, booking detail, confirmation, and destructive confirmation use the same native bottom-sheet geometry.
- Sheets have consistent top radii, backdrop opacity, close behavior, safe-area padding, and bounded height.
- Background content is visually de-emphasized while a sheet is open.
- Layering model: base content → bottom navigation → sheet backdrop → sheet → protected device chrome.
- Sticky actions, sheets, nav, and the center + clear the iPhone home indicator and Android navigation area.
- Result: **PASS**.

## Accessibility findings

- 44 × 44 minimum targets: PASS after correction.
- Visible keyboard focus: PASS.
- Logical headings and explicit button labels: PASS.
- Status communication uses text in addition to color/icons: PASS.
- Reduced motion disables prototype animation and transitions: PASS.
- Important text/control contrast is acceptable in the reviewed palette.

This gate does not replace real-device VoiceOver, TalkBack, browser zoom, or production localization testing.

## Findings by severity

| Severity | Found | Fixed | Remaining |
|---|---:|---:|---:|
| P0 | 0 | 0 | 0 |
| P1 | 2 | 2 | 0 |
| P2 | 4 | 4 | 0 |
| P3 | 3 | 0 | 3 |

### Corrections performed

- P1: expanded undersized Welcome legal touch targets to 44px.
- P1: collapsed cramped paired form fields at narrow mobile widths.
- P2: added the missing representative Hotel / Stay and Activity / Event forms.
- P2: added explicit authentication, loading, empty, error, and offline visual states needed by the inventory.
- P2: changed the Add Manually search surface into a real accessible input.
- P2: added deterministic confirmation and destructive-confirmation states for sheet geometry review.

### Remaining P3 items

1. Dedicated travel glyphs would improve a few category metaphors, but the current icon family is coherent and understandable.
2. The Vite prototype bundle reports a non-blocking chunk-size warning; this does not affect design QA and should be addressed during production implementation.
3. Real-device VoiceOver/TalkBack, OS font rendering, and long translated production content still require device QA.

## Final approval checklist

- [x] Buttons are correctly placed and meet touch-target requirements.
- [x] Icons are aligned and use one coherent family.
- [x] Back/X controls are consistently placed.
- [x] Sheets and dialogs have correct mobile geometry.
- [x] Bottom navigation and central + respect safe areas.
- [x] Forms remain usable with narrow and keyboard-reduced viewports.
- [x] No horizontal overflow or important clipping was found.
- [x] Timeline hierarchy is immediately understandable.
- [x] Needs Attention does not overwhelm the Timeline.
- [x] Multiple trips remain understandable.
- [x] Tickets & Documents remain contextual and easy to locate.
- [x] Empty/loading/error/offline states remain coherent.
- [x] 360, 390, and 430px layouts work.
- [x] Contrast, focus, and reduced-motion treatments are present.
- [x] The prototype reads as one coherent premium mobile product.

## Final result

**PASS** — no P0, P1, or meaningful P2 issue remains in the Product V2 mobile prototype. Stop here for product review; do not begin production V2 implementation from this QA gate.
