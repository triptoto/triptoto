# Button sizing design QA

## Visual source of truth

- Reference: `/Users/arthurberlin/Downloads/tripto.to 3.png`
- Implemented state: flight form discard-confirmation dialog
- Viewport: 390 x 844 CSS pixels
- Reference image: 1260 x 603 pixels
- Implementation capture: 1265 x 712 pixels
- Final screenshot: `/Users/arthurberlin/Documents/Codex/2026-08-20/users-arthurberlin-triptoto/outputs/button-sizing-discard-dialog-390x844.png`
- Side-by-side comparison: `/Users/arthurberlin/Documents/Codex/2026-08-20/users-arthurberlin-triptoto/outputs/button-sizing-comparison.png`

The comparison normalizes both images to the dialog region. The reference is a cropped production screenshot; the implementation capture includes more surrounding page content.

## Focused measurements

| Control | Before | After |
| --- | ---: | ---: |
| Keep editing | 143 x 50 px, 14 px top margin | 150.5 x 48 px, no top margin |
| Discard | 143 x 64 px | 150.5 x 48 px |
| Dialog | 335 x 173 px | 350 x 157 px |

## Findings and corrections

- **P1 fixed:** The shared secondary-action top margin leaked into the two-column confirmation dialog. This displaced `Keep editing` and allowed the grid to stretch `Discard` taller. Dialog actions now explicitly share the same 48 px height, margin, radius, and alignment.
- **P2 fixed:** Button dimensions were expressed as unrelated values across screens. Shared compact, secondary, primary, and row-height tokens now define the mobile control scale.
- **P2 fixed:** The installed service worker could retain the pre-fix stylesheet. The shell cache and CSS/JavaScript query versions were advanced so the corrected controls replace stale cached UI.
- **Responsive pass:** 360 x 800, 390 x 844, and 430 x 932 checks found no visible action below the 44 px touch-target minimum and no horizontal overflow on Timeline, Bookings, Account, Add Booking, Ready Offline, Trips, Create Trip, or Add Flight.

## Preserved design decisions

- Existing Apple system typography
- Existing pure-white, concrete-grey, and jet-black palette
- Existing labels, dialog semantics, and destructive-action behavior
- Existing icons and application navigation

## Result

**Passed.** The dialog actions are visually equal and the shared mobile button system is consistent without redesigning the approved interface.

---

# Welcome design QA

**Comparison target**

- Source visual truth: `/Users/arthurberlin/.codex/generated_images/01a02032-728d-7ce2-b111-775c80ec1cf0/exec-a318cd91-7aa8-41b6-9bcc-86a7c954356d.png`
- Implementation screenshot: `/private/tmp/tripto-welcome-flat-390x844.png`
- Combined comparison: `/private/tmp/tripto-welcome-flat-comparison.png`
- Responsive browser checks: 360 × 800 and 430 × 932
- Source pixels: 853 × 1844
- Implementation pixels and CSS viewport: 390 × 844 at device scale factor 1
- Normalization: source scaled to 390 × 844; app capture remained at native CSS size
- State: local preview, guest account, no trips, online

**Findings**

- No actionable P0, P1, or P2 differences remain.
- Fonts and typography: Apple system stack, hierarchy, two-line wrapping, weights, and colored emphasis match the approved target closely.
- Spacing and layout rhythm: brand, headline, journey, compact Google action, tour action, and legal footer align with the source composition. The screen remains intentionally fixed and no-scroll.
- Colors and visual tokens: implementation uses the approved Slate palette (`#212c36`, `#354655`, `#f6f1e9`, `#b7c2cb`, `#d9b99b`, `#b84a62`). The document, body, app shell, Welcome screen, preview frame, and journey artwork now share the exact flat `#212c36` canvas.
- Image quality and asset fidelity: the journey artwork is a dedicated local PNG asset with its former backdrop variation normalized to the exact Welcome canvas color. Foreground route geometry, icons, labels, crop, and color accents remain unchanged.
- Copy and content: visible copy matches the approved design. The example is explicitly labeled `EXAMPLE JOURNEY` and does not enter application state.

**Focused region comparison**

- The compact Google action was checked independently because the user rejected the earlier oversized white treatment. It is now 240 × 52 CSS px, dark Slate, bordered with the approved sand/rose accents, and retains a 52px touch target.
- The route illustration was checked at full-view size; its icons, line, labels, and crop are clearly readable, so no additional zoomed crop was needed.
- The source target and implementation were compared together at 390 × 844. The source's subtle dark backdrop variation was intentionally replaced with the requested single flat canvas; the foreground composition remains faithful.

**Interaction and responsive evidence**

- Verified at 360 × 800, 390 × 844, and 430 × 932.
- No horizontal or vertical document overflow.
- No bottom navigation appears on Welcome.
- Google and Tour actions remain visible; Privacy and Terms remain visible above the safe-area padding.
- Tour opens as an accessible modal sheet, Escape closes it, and focus returns to `Take a tour`.
- Offline state remains labeled `Offline` and does not overflow.
- Browser console: no errors or warnings in the verified preview state.

**Comparison history**

1. Initial implementation still exposed the former photographic backdrop, used brighter off-palette accents, and retained an oversized light Google action.
2. Fixed by isolating Welcome under `.welcome-thread`, using the Slate tokens, restoring the compact dark Google treatment, and preventing the shared Account Google renderer from changing.
3. Second comparison found scale and vertical-rhythm drift. Brand, hero type, CTA width, section spacing, and bottom safe-area spacing were adjusted.
4. Final side-by-side comparison shows no remaining P0/P1/P2 mismatch.
5. The uniform-background pass removed the remaining raster backdrop variation and a higher-specificity preview decoration. Post-fix evidence confirms every Welcome canvas surface resolves to `rgb(33, 44, 54)` with no seams.

**Implementation Checklist**

- [x] Welcome-only markup and scoped styling
- [x] Local journey asset and service-worker cache entry
- [x] Compact Google action without changing Account
- [x] Tour, Privacy, Terms, offline, and auth wiring preserved
- [x] 360/390/430 responsive verification
- [x] Console and overflow checks

**Follow-up Polish**

- The production Google control is rendered by Google Identity Services, so its internal typography remains provider-owned while its Welcome-only width and placement match the approved composition.

final result: passed
---

# Design QA — Welcome responsive scale correction

## Comparison evidence

- Reported production defect: `/Users/arthurberlin/Downloads/tripto.to 164.png`
- Corrected `390 × 650` browser-height capture: `artifacts/welcome-passport-v4/welcome-390x650.png`
- Corrected `390 × 844` full-viewport capture: `artifacts/welcome-passport-v4/welcome-390x844.png`
- Normalized before/after comparison: `artifacts/welcome-passport-v4/comparison-reference-vs-compact.png`

The reported screenshot was treated as defect evidence, not as a new visual target. The selected Passport Cover structure, color, route artwork, Google action, Tour action and legal footer remain unchanged.

## Corrections

- **P1 fixed:** removed the forced four-line hero treatment. The headline now uses two deliberate, readable lines at every supported phone width.
- **P1 fixed:** replaced width-dominated scaling with width-and-height-aware type, artwork, marker and action tokens.
- **P2 fixed:** reduced route marker optical size while preserving the supplied icon system and editable SVG route.
- **P2 fixed:** normalized both Welcome actions to a guaranteed `48–52px` touch height.
- **P2 fixed:** advanced the stylesheet, script and service-worker cache identifiers so Safari does not retain the oversized version.

## Responsive evidence

| Viewport | Overflow | Headline | Artwork | Google | Tour |
| --- | --- | ---: | ---: | ---: | ---: |
| `360 × 540` | none | 58px / 2 lines | 94px | 48px | 48px |
| `390 × 600` | none | 62px / 2 lines | 102px | 48px | 48px |
| `430 × 700` | none | 73px / 2 lines | 147px | 48px | 48px |
| `360 × 800` | none | 65px / 2 lines | 162px | 48px | 48px |
| `375 × 812` | none | 68px / 2 lines | 169px | 48px | 48px |
| `390 × 844` | none | 70px / 2 lines | 176px | 48px | 48px |
| `393 × 852` | none | 71px / 2 lines | 177px | 48px | 48px |
| `430 × 932` | none | 78px / 2 lines | 190px | 52px | 52px |

- The first-run screen remains fixed and no-scroll.
- No bottom navigation appears on Welcome.
- Tour opens, closes, and restores focus to `Take a tour`.
- Google Identity Services remains provider-rendered in production; its container is not cropped or restyled internally.

final result: passed

---

# Design QA — V3 Journey Ribbon with V1 colors

- Structure source: `/Users/arthurberlin/.codex/generated_images/01a02032-728d-7ce2-b111-775c80ec1cf0/exec-993696c8-6e69-4756-8c4d-c8dce2680aee.png`
- Palette source: `/Users/arthurberlin/.codex/generated_images/01a02032-728d-7ce2-b111-775c80ec1cf0/exec-84d3aea8-22b3-44cd-924a-75a51e2ee436.png`
- Implementation screenshot: `artifacts/ui-v3-colors-v1/timeline-390x844.png`
- Welcome screenshot: `artifacts/ui-v3-colors-v1/welcome-390x844.png`
- Small-phone screenshot: `artifacts/ui-v3-colors-v1/timeline-360x800.png`
- Direct comparison: `artifacts/ui-v3-colors-v1/comparison-option3-vs-implementation.png`
- Primary comparison viewport: `390 × 844`

## Visible comparison

The implementation preserves option 3's date capsules, circular journey nodes, emphasized current event, compact next summary, and light floating five-item dock. Option 1's slate, warm sand, off-white, cool-grey and restrained coral tokens intentionally replace option 3's original colors. Real application typography, data truth, clean routes and existing icon library remain intact.

## Responsive and interaction checks

- `360 × 800`: no horizontal overflow; dock visible above the safe area.
- `390 × 844`: no horizontal overflow; Timeline and Welcome fit their intended mobile states.
- `430 × 932`: app remains centered at the 430px maximum; dock remains visible.
- Welcome: one background color, no bottom navigation, no vertical or horizontal scrolling.
- Alerts opens and closes; Add opens the existing Add Booking flow; To-do routes to `/before-you-go`.
- Browser console: no errors in the tested flows.

## Severity gate

- P0: none
- P1: none
- P2: none

Final result: passed

---

# Design QA — Coral Journey Ribbon visual lock

## Visual source and normalized comparison

- Source of truth: `/var/folders/9q/f2w2qrrd1ddg3gb4vczcfzmc0000gn/T/codex-clipboard-ec470206-6752-440a-b83c-b3f57d77f647.png`
- Source dimensions: `862 × 1840`; normalized to `430 × 920` for direct comparison
- Populated Timeline capture: `artifacts/coral-journey-v2/timeline-430x920.png`
- Standard phone capture: `artifacts/coral-journey-v2/timeline-390x844.png`
- Narrow phone capture: `artifacts/coral-journey-v2/timeline-360x800.png`
- Welcome capture: `artifacts/coral-journey-v2/welcome-390x844.png`
- Side-by-side source and implementation: `artifacts/coral-journey-v2/comparison-reference-vs-implementation.png`
- State: isolated populated preview with real application rendering and deterministic synthetic travel data

## Findings and corrections

- **Color fidelity fixed:** replaced the muted blue-grey treatment with the reference's ink-black canvas, saturated coral emphasis, warm sand journey rail and icons, off-white primary text, and restrained grey metadata.
- **Timeline hierarchy fixed:** the next event now carries the coral plane and `NEXT` label while ordinary events retain warm sand icons. Day labels, rail dots, chevrons, and separators match the reference hierarchy.
- **Navigation fidelity fixed:** the floating dock is dark and outlined, inactive items use sand, the active Trip item and center Add control use coral, and Trip uses the approved suitcase icon.
- **Welcome cohesion fixed:** Welcome uses the same ink, coral, sand, off-white, and grey family without changing authentication or tour behavior.
- **Surface fidelity fixed:** removed the Timeline header divider so header and journey read as one continuous dark surface.

## Responsive, interaction, and accessibility evidence

- Verified at `360 × 800`, `390 × 844`, and `430 × 920` with no horizontal overflow.
- Timeline content scrolls inside its page region; the fixed dock remains visible and bottom padding keeps the final event reachable.
- Touch targets remain at least 44 px; focus-visible and reduced-motion rules remain intact.
- Trip, Alerts, Add, To-do, and Account retain their existing routes/actions and accessible labels.
- Browser console in the checked Timeline and Welcome states: no errors or warnings.
- Welcome remains no-scroll and has no bottom navigation.

## Severity gate

- P0: none
- P1: none
- P2: none

final result: passed

---

# Design QA — pastel travel system

- Reference: `/Users/arthurberlin/Library/Messages/Attachments/de/14/58D71E70-9153-491D-81F9-3CCC2C34C0D6/IMG_4494.png`
- Reference pixels: 853 × 1844
- Implementation screenshot: `artifacts/pastel-travel-v33/timeline-390x844.png`
- Implementation pixels: 390 × 844 at 1× capture density
- Browser viewport: 390 × 844
- Application state: local preview, populated Rome 2026 Timeline, first trip day selected
- Comparison artifact: `artifacts/pastel-travel-v33/timeline-comparison.png`

## Interaction tested

- Timeline rendered with the populated deterministic preview state.
- The Friday day tab was selected and the visible day changed to Friday without navigation or console failure.
- Bottom navigation touch targets measured at 44px minimum; the central Add action measured 54px.
- Document width matched the viewport with no horizontal overflow.

## Visual comparison

- Warm ivory canvas, dark navy typography, violet navigation/action emphasis, orange `NEXT`, green confirmation copy, and yellow Add action match the supplied direction.
- Flight, transfer, and stay markers use distinct pale blue, peach, and mint circles with consistent navy outline icons.
- The Timeline remains flat and readable, with the same editorial titles and compact hierarchy as the reference.
- Welcome, Add Flight, and Account were spot-checked at phone size to confirm the shared palette reaches onboarding, forms, content, and navigation.

## Runtime audit

- JavaScript console errors: none observed.
- Browser warnings: none observed.
- Horizontal overflow: none at 390 × 844.

final result: passed
