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
