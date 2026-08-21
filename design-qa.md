# Mobile UI polish visual QA

Final result: passed

- Home at 390×844 shows the current trip, compact next-flight ticket, Upcoming Journey, and Trip Health above the fixed navigation.
- Timeline uses flat rows and separators; routine confirmation labels are suppressed.
- Flight Detail prioritizes departure, boarding, terminal, and gate; secondary metadata is grouped and ticket details are disclosed on demand.
- Hotel actions appear directly below the compact stay dates and remain clear of navigation.
- Ready Offline uses compact rows, one readiness summary, and no yellow treatment in the all-ready state.
- Add Booking fills the available sheet width with 20px side padding and safe-area-aware bottom padding.
- Automated viewport checks passed at 360×800, 375×812, 390×844, 393×852, and 430×932 with no horizontal overflow or visible interactive target below 44×44px.
- Final polish verification at 390×844 separates Terminal from Gate, presents Confirmed as the primary green status with neutral Scheduled data provenance, and uses compact event-local departure/arrival times.
- Home displays the complete `No known trip issues.` summary, Ready Offline highlights Trip, and in-trip hotel dates omit the redundant year.
