# Browser audit methodology

## Scope and isolation

This records the local visual audit of the existing Tripto shell and its app-controlled interactions. Baseline commit: `196b25c7413a33f789652ffc79945efb5b88a1f2`. At the end of that audit, no production data edits, invitation sends, account deletions, purchases, deployment, git push or release approval had been performed. The user's subsequent “deploy everything” instruction authorized the separate release recorded below.

The app runs with `?preview=1` from a loopback static server. Existing preview data is supplemented by a clearly local fixture for Neighborhood, ideas, roles and invitation states. Synthetic roles and API error/loading states are **rendering evidence**, not proof of successful real authentication or persistence. Fixture rates/weather are not real travel information. The only file uploaded in the browser audit was a generated LOCAL QA PNG, staged on the isolated browser profile and then removed.

Screenshots use actual CSS viewports. Contact sheets resize originals solely to aid review. Each route was scrolled in its own scroll container; screenshots and browser JSON records are retained. Programmatic horizontal-overflow checks alone do not constitute visual review.

## Repeat locally

Python needs `websockets` and `Pillow`; the app uses its existing npm dependencies. Run from the repository root. Use a dedicated Chrome profile and CDP port, never a personal browsing profile.

```sh
npm run build:app-shell
python3 scripts/design-audit/server.py
```

In a separate terminal:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9224 --remote-allow-origins='*' \
  --user-data-dir=/tmp/tripto-design-audit-isolated \
  --no-first-run --disable-background-networking about:blank
```

In another terminal, run the suites **sequentially**:

```sh
python3 scripts/design-audit/browser.py pages.py 390 844
python3 scripts/design-audit/browser.py states.py 390 844
python3 scripts/design-audit/browser.py extra.py 390 844
python3 scripts/design-audit/browser.py overlays.py 390 844
python3 scripts/design-audit/browser.py matrix.py 390 844
python3 scripts/design-audit/browser.py regression.py 390 844
python3 scripts/design-audit/browser.py variants.py 390 844
npm run check:ui
npm run validate:v2
git diff --check
```

The default output is a timestamped directory under `docs/design-audit/evidence/`; set `TRIPTO_AUDIT_OUTPUT` to group suites in one **new** run folder. Do not overwrite the 2026-09-08 evidence. `TRIPTO_AUDIT_URL` and `TRIPTO_AUDIT_CDP` accept loopback hosts only. Every runner-created tab is closed by the runner; it does not select or close an existing user tab.

Some original exploratory cases were superseded; the durable scripts include the corrected selectors and readiness checks. The durable edit-form, variant and overlay suites were executed successfully after extraction. The final [overlay replay](overlay-replay.json) confirmed 22 dialogs with focus containment and Escape, one functional Driver screen and one blocked account-preview endpoint. The other suite files preserve the tested discovery steps and fail on selector exceptions; they have not all been repeated again after being moved into the repository.

## Evidence levels and acceptance

1. Confirm the intended screen and data state actually rendered. A resolved URL alone is insufficient.
2. Inspect the full screen and all scrolling regions; open every discovered local overlay through its existing UI trigger.
3. Check geometry: width, header position, card/text boundaries, reachable bottom controls, popup height and independent list scrolling.
4. Check keyboard and dismissal: focus entry, repeated Tab/Shift+Tab, Escape, explicit Back/Close, opener focus and preserved form values.
5. Check dependent states with local fixtures, and label them as fixtures. Do not treat local previews as production integration passes.
6. Rebuild minified assets after source edits. Run the relevant contracts and the application validation suite.
7. Record any changes after a full run. Here the final two CSS-only corrections were followed by `check:ui` and the responsive browser run.

There is no screenshot-comparison auto-pass. Every screenshot needs human/model visual review in addition to numerical assertions. The index records rendered cases; it does not imply every action writes successfully to a server.

## Attempts and superseding evidence

- The first matrix attempt assumed every screen had a hero and raised a harness KeyError. Corrected optional geometry lookup produced the completed 84-case result file `matrix/results-0-6.json`. Original error files remain for traceability.
- Six original matrix “missing” cases navigated through an alias that recovered to Timeline. They do **not** count as missing-page evidence. `final/missing-320…1024` and `final/missing-844` explicitly rendered the missing-plan state and asserted navigation position; the durable matrix uses that entry.
- The first document run reused an identical PNG and triggered the app's duplicate-file handling. A timestamped PNG was then used. Baseline keyboard failures are real product findings; `final/document-return.json` is the superseding successful regression.
- The first edit-form disclosure test clicked already-expanded, prefilled panels and therefore captured them collapsed. The completion runner opens only when closed and asserts `moreExpanded`; all 18 edit variants passed.
- The old manual-booking sheet has no live UI trigger in this build. The failed exploratory attempt is classified NOT APPLICABLE, not a product pass. Add Booking's actual inline category choices were reviewed.
- An email trip-picker selector and several early exploratory form helper calls were corrected. Successful `states/email-trip-picker` and `flows/*.json` supersede those attempt error files.
- Expired invite fixtures originally supplied a numeric date where the renderer expects a date string. They were corrected to ISO strings before the role/invitation review.
- One extracted variant run attempted fixture injection before the local shell loaded. The runner now waits for initialization and reports an explicit failure if it does not occur. The rerun completed all 26 variant cases.
- Original `remaining/currency-large` and attachment keyboard evidence intentionally preserve real pre-fix failures. Final responsive/currency and viewer results supersede them.
- The long-title deletion-dialog fixture verifies the dialog, not arbitrary-length background collection layout.

## Platform follow-up

Actual iPhone Safari keyboard/browser-chrome behavior, browser zoom 200%, native PDF viewer traversal, real Google callback and production recognition/deletion preview require an appropriate device or integration environment. Equivalent 512×340 reflow is recorded separately; it is not mislabeled as real 200% zoom.

## Authorized production release, 2026-09-08

After the user requested “deploy everything”, all audited runtime changes and the removal of the pretrip preparation card were committed as `62c7bb2134a3f8cdac2ad504444393c177b6c769` and pushed to `fix/keyboard-header-20260907`. The cache namespace was advanced to `tripto-shell-product-v244-design-audit`, both shell asset URLs to `flat-design-system-v166`, and matching contracts were synchronized.

The full `validate:v2` suite and Wrangler dry run passed for that final build. Cloudflare deployment used the verified `travelinkme@gmail.com` account and the existing production Worker `tripto-api`. Public `/health` and SHA-256 comparisons for all eight changed assets passed. Actual browser checks covered Trips, Create Trip, the date picker and Back navigation; Create Trip was reviewed at 320×568, 390×844 and 430×932. No trip was created or modified during the live check. One immediate screenshot during viewport resizing contained a stale scaled frame; the stable frame and DOM geometry were rechecked successfully.

See [release record](release-v244.json), [deployment output](deploy-v244.log), [full validation](validation-v244-release.log) and [dry run](dry-run-v244-release.log). This publication does not convert the physical-device and integration limitations above into completed tests.
