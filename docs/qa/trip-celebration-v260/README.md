# New trip success celebration — v260

Shared compact sheet with escaped trip title, checkmark entrance and 18 theme-color confetti pieces. One-shot animation under 2.2s, disabled with reduced motion. Open trip routes to timeline; existing Close/backdrop/Escape handling applies. Hook runs after successful new-trip save and refresh, excludes edits and warning/error paths. Preview hook only runs after an actual first preview trip is created. No persistent flag and no reload-triggered replay.

Validation: check:ui, header-navigation and smart-import-auth contracts passed; dry run passed. Local no-API preview journey: select Rome Italy, skip dates, Next, Create trip -> success sheet with correct title; 320/390/430px, 48px CTA, 18 pieces, no overflow. Open trip -> /trips/rome-italy and sheet removed. Screenshot inspected. Real production trip not created for testing. Failure/edit guards inspected in source; backend errors not fault-injected in browser.
