# Header navigation v250

Bottom navigation is removed from every application renderer. Page headers now provide adjacent Add and Menu controls; the compact Menu contains exactly All trips, Trip Options, To-Do List and Account. These are real internal links and normal taps retain SPA routing and unsaved-change protection.

All trips is protected: its renderer is byte-for-byte unchanged from v249 and still uses Account / Create trip, with no menu or bottom bar. Neighborhood Add continues to add a place. Other trip pages open the Add-to-trip hub; an account without a trip can create one. View-only access remains enforced.

Page-specific Back, Save, Share, Edit, Delete and notification actions remain available. The standard navigation row is 68px. A compact second action row prevents crowded headers on forms and booking details. Page content uses the freed bottom space. Public Privacy and Terms pages have the same destinations and compact menu treatment, with local inline icons.

Opening or closing Menu preserves the underlying form DOM, scroll and unsaved inputs. Selecting a different destination uses the existing discard guard. Explicit routes are reachable before a guest has any trips; the welcome screen no longer intercepts Account or Create trip. Recovery screens can also navigate back to Account without being stuck on an error presentation.

## Verification

- `npm run validate:v2` passed, including UI, typecheck, scenarios, local D1 integration, auth/import, collaboration, collections, loading recovery, render preservation, notes and viewport checks.
- New `tests/header-navigation.contract.mjs` exercises the actual menu, Add handler, router and delegated link handler: exact destinations, same-route behavior, modified clicks, viewer restrictions, dirty forms and focus restoration.
- Additional keyboard-header, Trips journal, Trip Map, legal-script syntax, diff and protected-renderer checks passed.
- Browser: 71 route/form variants at 320, 390 and 430px (213 geometry checks), with no header overlap or horizontal overflow. All 71 also opened and closed Menu. Full inventory and additional state checks are in `browser-matrix.json`.
- Cloudflare dry run passed using the travelinkme@gmail.com production account. No backend code, schema or feature flags changed.

Browser checks used the actual local UI with isolated fixtures. Production publication, served asset hashes and public browser checks are recorded separately in `release.json`. Physical iPhone keyboard behavior was not tested; reduced-height browser geometry and the existing visual-viewport regression tests passed.

## Publication

- Application commit: `7f85a20`, pushed to `fix/keyboard-header-20260907` without merging to main.
- Cloudflare Worker: `2393affc-4425-4add-bbb2-1bd3ac42ea9a`, 100% traffic, tag `v250-header-navigation`.
- Public `/health`: healthy, D1 healthy (59 tables), feature flags unchanged.
- All 10 checked public app/legal files exactly match the local release SHA-256 hashes.
- Public browser loaded asset version `flat-design-system-v172`; all four menu destinations, Add, Back and the protected Trips header passed. No preview mode or user data mutations were used for the public check.
