# Live Beta Known Issues

Last updated: 2026-08-22  
Production release: `dbdec0afca88d621798cc1be4eb8e930b9cc1a3a`

This is an open issue list for the live beta. Items remain visible here until they are fixed and verified in production.

## P1 — important workflow broken

- **Empty-trip Timeline button opens the Trip list.** On Home for a newly created trip with no bookings, the secondary button labeled **Timeline** routes to the Trip list instead of the chronological timeline. The primary **Add booking** action works, so trip creation and setup are not blocked.

## P2 — secondary function broken or incomplete

- **Advanced add/edit coverage is incomplete.** The mobile UI does not yet provide full parity for every advanced booking field or editing path. Some advanced operations still rely on the legacy beta interface at `/legacy.html`.
- **Secondary controls are not exhaustively certified.** The live launch smoke covered first-run, Create Trip, Save Trip, Home, reload persistence, the Add-to-trip sheet close control, browser Back, and Trip Health. Other secondary sheet/dialog and navigation controls remain beta-quality and must be logged here when a reproducible failure is observed.

## P3 — polish or expected beta limitation

- **Live flight state is unavailable.** Flight information is scheduled data only because live-flight integration is disabled.
- **Cloud document storage is unavailable.** Documents remain device-local because R2 document storage is disabled.
- **Public accounts and sharing are unavailable.** Account authentication and sharing remain intentionally disabled for this beta.

## Controls verified in the production launch smoke

- **Create my first trip** opened Create Trip.
- **Save Trip** created a dated trip and preserved it after a full page reload.
- **Add booking** opened the Add-to-trip sheet.
- **Close Add to trip** closed the sheet.
- **Review** opened Trip Health.
- Browser Back returned to Home.

No JavaScript console error was observed during this core smoke test.
