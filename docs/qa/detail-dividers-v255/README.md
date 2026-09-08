# Lower booking card separators — v255

Restored theme-token 1px separators between supporting booking rows, including documents and expanded Flight details metadata. Last row has no extra bottom border. Upper summary cards, header tiles and popup menus are unchanged.

Validation: check:ui, header-navigation, booking-notes and smart-import-auth contracts passed. Local browser fixtures for flight, hotel, train and activity passed at 320, 390 and 430 px: all intermediate rows have 1px bottom borders, final rows 0px, no horizontal overflow. Flight fixture includes a linked PDF row; expanded Flight details visually inspected at 390px. Fixtures do not modify user data.

Wrangler identity verified as travelinkme@gmail.com; root deployment dry run passed. Cache namespace and shell URLs bumped to v255/v177.

Production: application commit f6a6d2d; Worker a5b3906e-4071-45fe-bcb2-2741b7852d66 deployed successfully. /health healthy with 59 database tables and unchanged feature flags. Public minified CSS, service worker and index match local SHA-256. Public flight preview at 390px initially used the previous cached shell; reload loaded v177 and confirmed 1px intermediate separators, 0px final border. This was preview data, not an authenticated user's booking.
