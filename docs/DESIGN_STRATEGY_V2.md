# tripto.to Design Strategy V2

Status: approved visual and interaction direction implemented in the V2 review prototype.

## Design objective

The interface should feel calm enough for planning and decisive enough for travel day. It must make chronology and the next meaningful action visually obvious without resembling a dashboard.

The design reduces cognitive load by:

- keeping one primary action per state;
- using Timeline order as the organizing principle;
- reserving status color for meaningful exceptions/results;
- hiding empty and secondary fields;
- replacing system terminology with traveler outcomes;
- using focused full-screen tasks and short bottom sheets instead of nested navigation.

## Visual hierarchy

Priority order on Timeline:

1. current trip identity and date context;
2. NEXT or highest-priority Needs Attention result;
3. chronological booking rows;
4. secondary detail and history.

Priority order on Welcome:

1. product promise;
2. Continue with Google;
3. Take a Tour;
4. privacy/terms.

Avoid equal visual weight across unrelated modules. The screen should have one dominant reading path.

## Typography

Use the native Apple system stack for all interface text and locally hosted DM
Serif Display only for trip and booking titles. No external font request is made:

```css
--font-ui: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display",
  "Helvetica Neue", Arial, sans-serif;
--font-title: "DM Serif Display", Georgia, "Times New Roman", serif;
```

- Display: 48–52px / 700 for Welcome and exceptional product moments.
- Route: 40px / 700 for airport codes and primary travel numbers.
- Screen: 28px / 700 for page titles.
- Section: 20px / 600 for event, sheet, and grouped-content titles.
- Text: 16px / 400 for body/forms and 16px / 600 for actions.
- Metadata: 13px / 500 for dates, provenance, and secondary location.
- Labels: 11px / 600 for short uppercase markers and bottom navigation.
- Use tabular numerals for travel times, dates, gates, seats, and flight facts.
- Use sentence case; avoid all-caps except very short contextual markers such as NEXT.
- Do not use Inter or Geist as the primary interface font.
- Google Identity controls and icon glyphs remain intentionally isolated from
  the application text fonts.

## Icon system

- Phosphor Regular is the default for navigation, booking categories, actions, and utility controls.
- Phosphor Fill is used only for selected or current states.
- Custom SVG is reserved for weather, destination artwork, and a deliberately approved branded travel symbol.
- Do not mix in another general-purpose outline or solid icon family.

## Color

Use the single production palette documented in `PRODUCTION_DESIGN.md`:

- warm light canvas `#EEEEEE`;
- white surfaces `#FFFFFF`;
- quiet controls `#E4E4E4` and dividers `#DDDDDD`;
- primary text/icons `#111217` and secondary text `#5A5A5A`;
- restrained coral accent `#CB2957` and accessible success `#1B704B`.

Scheduled data receives neutral provenance and never uses color to imply live status.

## Spacing and density

Use a 4px base with a practical mobile rhythm of 8, 12, 16, 20, 24, and 32px.

- Page edge: 20px at 390px, no less than 16px at 360px.
- Booking rows: compact 12–16px vertical padding, minimum 44px target.
- Section gaps: 24px; related-item gaps: 8–12px.
- Safe areas: always include `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
- Fixed controls must never cover Timeline content or focused form inputs.

Whitespace separates decisions; it does not exist to create oversized marketing compositions inside the app.

## Surface and card language

Use the page surface first. Prefer grouping, alignment, typography, and thin separators over cards.

Cards are reserved for:

- the dominant NEXT/Needs Attention action;
- a standalone booking pass or document;
- a contained recovery state.

Avoid cards inside cards, a card for every Timeline row, heavy borders, and multiple competing shadows. Use consistent 18–24px radii for major surfaces and 12–16px for compact controls/sheets. Shadows should be soft and rare.

## Navigation model

Authenticated bottom navigation contains exactly:

- Trip
- Alerts
- central +
- To-do
- Account

The central + is prominent but does not visually overwhelm the current Timeline. It opens a two-choice sheet before any booking category is shown. Alerts opens traveler-facing notifications; To-do opens the current trip checklist. Welcome, Tour, Create Trip, and focused auth states omit bottom navigation.

Desktop presents the same mobile product centered at a maximum width around 430px; it does not become a desktop dashboard.

## Timeline language

Timeline uses one continuous vertical journey line or strong chronological alignment, not isolated card tiles. Each row contains:

- local time/date anchor;
- type icon;
- essential title or route;
- one secondary line;
- status only if actionable or exceptional.

Day/date separators provide orientation. Past items become quieter; the current/next item receives emphasis. Event-local timezone handling remains intact. Overnight and date-line changes display local dates clearly rather than forcing device time.

## Contextual emphasis

- **Before you go:** compact preparation surface above Timeline.
- **NEXT:** strongest in-trip surface with immediate action.
- **Needs Attention:** one issue with clear consequence and resolution.
- **Completed:** calm historic state without active urgency.

Multiple issues are summarized, never presented as a grid of warnings.

## Bottom sheets

Bottom sheets handle short choices: + menu, Add Booking method, trip selector, and simple contextual explanations.

Rules:

- visible drag handle and labeled close control when needed;
- backdrop dismissal only when data loss is impossible;
- focus trap, focus restoration, Escape support, and semantic dialog labels;
- keyboard/safe-area-aware height;
- one primary action anchored safely above the bottom inset;
- meaningful dirty forms use a full screen, not a dismissible sheet.

## Dialogs

Use alert dialogs only for destructive or blocking decisions. Copy states the consequence directly. Do not use generic “Are you sure?” without naming what will happen.

## Buttons

- Primary: jet-black fill, white text, minimum 52px for major tasks.
- Secondary: concrete or transparent surface with jet-black text.
- Destructive: explicit consequence copy and icon support without introducing another palette color.
- Icon-only controls require accessible names and 44×44px targets.
- Disabled controls explain why when the user needs the action.
- Press feedback is subtle and respects reduced motion.

## Forms

Forms are short and type-specific. Labels remain visible after entry; placeholders are examples, not labels. Use correct input modes, autocomplete, and localized date/time presentation.

Create Trip uses one date-range selection rather than two unrelated date controls. Sticky save controls remain above the software keyboard. Validation is inline, moves focus to the first error, and preserves entered values on failure.

## Motion

Motion explains continuity only:

- sheet entrance/exit;
- Timeline insertion/update;
- selection and confirmation feedback;
- brief disclosure transitions.

Use approximately 160–220ms ease-out transitions. Avoid parallax, perpetual decorative motion, and confetti. Under `prefers-reduced-motion: reduce`, remove transforms and nonessential animation while preserving state changes.

## Empty states

Empty states describe the next useful action, not system absence.

- No account trips: open Create Trip directly after sign-in.

Authentication is a transient system state. Continue with Google begins authentication from Welcome, then routes directly to Create Trip for zero trips or the relevant Timeline for an existing account. There is no separate sign-in decision screen.
- New trip, no bookings: “Add your first booking” → Add Booking.
- Empty history: simple factual text; no fake sample trip inserted into state.

Never show “Everything looks good” or “Trip ready” for an empty trip.

## Tickets & Documents

Documents use the same calm, mobile-first visual system as Timeline. A compact document row includes a familiar file icon, plain-language type/name, booking context, and one truthful availability line. Booking Detail is the primary discovery path; one restrained document icon in the Trip header opens the trip-wide grouped view. Neither bottom navigation nor Account becomes a document browser.

The trip-wide view follows journey order and booking names, using thin dividers and compact rows rather than folders, filters, or a file-manager grid. Unlinked files receive a warm **Needs Attention** treatment and one **Link to Booking** action. The booking chooser uses recognizable booking titles and includes **Other / Keep unlinked**.

On mobile, document actions remain at least 44×44px, full labels never truncate storage meaning, and opening a sensitive ticket is a deliberate tap. **Available offline**, **Available on this device**, **Stored on this device**, and **Not available offline** are visually distinct without exposing readiness-engine terminology. Destructive actions are visually secondary, explain their scope, and never imply that removing a file removes the booking.

## Attention states

Attention copy has three parts:

1. what needs attention;
2. why it matters now;
3. one resolution action.

Severity is communicated with text and icon, not color alone. Lower-priority issues stay collapsed behind a count.

The Timeline renders exactly one primary contextual surface, selected deterministically in this order: urgent/critical disruption; NEXT/current during-trip action; time-sensitive preparation; general preparation; informational context. A successful first booking uses a compact inline confirmation, never a large onboarding card.

## Offline, stale, and unavailable states

- Show Offline only while offline.
- Previously cached content remains usable when permitted.
- Stale network-dependent data includes its timestamp/status.
- Scheduled flight data is labeled Scheduled data, never live.
- Estimates remain labeled Estimated.
- Missing timestamps make cached routes unavailable; no recommendation is generated.
- Unsynced and conflicted work remains visible until resolved.

## Error and recovery

Errors appear near the failed task and preserve input. Recovery actions are concrete: Retry, Keep editing, Choose trip, Review booking, or Continue offline. Avoid technical codes in the primary message; request IDs may appear in secondary support detail.

Auth cancellation returns to Welcome without deleting guest/local data. Session expiry never silently discards unsynced changes.

## Accessibility

- Semantic landmarks, headings, lists, buttons, and forms.
- Minimum 44×44px touch targets.
- Visible `:focus-visible` indicators.
- Contrast meeting WCAG AA for text and controls.
- Dynamic status via restrained `aria-live` regions.
- Bottom sheets use `role=dialog`, `aria-modal=true`, focus trap, and restoration.
- Icons never carry meaning without a label or accessible name.
- Timeline remains understandable without color or animation.
- Text supports zoom/reflow without horizontal scrolling.

## Responsive rules

Primary design viewport: 390×844.

Verify 360×800, 375×812, 393×852, and 430×932:

- no horizontal overflow;
- no clipped title/action;
- bottom controls clear the safe area and keyboard;
- no hidden Timeline content;
- no two-line primary navigation labels;
- sheets fit or become internally scrollable without moving the document.

At wider desktop sizes, center the same mobile experience at approximately 430px. Do not introduce desktop sidebars, data grids, or dashboard columns.

## Component strategy

Shared V2 primitives:

- Welcome frame
- Product wordmark
- Google identity button
- Tour pager
- App bar / trip selector
- Five-item bottom navigation
- Primary and secondary actions
- Timeline day separator
- Timeline booking row
- NEXT surface
- Needs Attention surface
- Booking detail header and fact rows
- Contextual document row
- Bottom sheet
- Form field and date-range picker
- Empty, offline, stale, conflict, and recovery states
- Toast/status announcement

Components accept real data and explicit availability/provenance. They do not manufacture placeholder facts.

## Visual QA gate

The approved direction is applied to the complete core and document-state inventory and reviewed together in one contact sheet. A screen is not approved in isolation if it introduces inconsistent navigation, spacing, terminology, or interaction behavior.

## Contextual Trip Map

The Trip Map reuses the single production visual system: coral accent for the active day chip, selected marker, NEXT badge, and route polyline; neutral content tokens everywhere else. Markers are teardrop pins carrying the existing type glyphs (flight/hotel/train/ferry/car/restaurant/activity/event) — no new icon family. The marker preview and "Also on this trip" rows use the same card, spacing, and secondary-action button language as the detail screens. Touch targets stay >=44px. The map is entered contextually and returns to the Timeline; it introduces no new navigation model. Components render only real data and explicit availability — an unresolvable place is listed by address rather than plotted with a fabricated point, and provider failure states are honest ("Map unavailable right now"). See TRIP_MAP_V2.md.
