# Account and To-do — v246

The two pages now use the existing Elegant Flat Cards design system. This is a scoped UI update; authentication, trip data, checklist persistence and navigation handlers remain in place.

## Changes

- Account uses a compact white profile card, restrained trip counts, 52px quick actions and shared `FlatRow`, `FlatList`, `SectionHeader` and `PastelIcon` components. Large colored shortcut tiles and the decorative passport heading/divider were removed.
- Account email, pending changes, travel services, support and data actions share the same 40px icon, 16px row title, 14px metadata and grouped-card rhythm as the other utility pages. Travel eSIM now uses the existing in-app action and returns to Account with Back.
- To-do uses the same title in its header and browser tab. Its summary and lists use 16px-radius white cards. Add and rename fields use the shared 52px input height; the add button matches it.
- One edit control remains beside each task, giving longer titles more space. Delete stays available inside the inline editor alongside explicit Cancel and Save buttons. Existing deletion and Undo handlers are unchanged.
- Completed tasks, progress and empty-state suggestions use existing theme colors. Old overlapping Account/Checklist style blocks were consolidated instead of adding another global override.
- The shell cache is `tripto-shell-product-v246-account-todo`; both generated asset URLs use `flat-design-system-v168`.

## Verification

- `npm run check:ui`: passed. Two existing copy assertions were updated to reflect the new visible labels.
- `npm run validate:v2`: passed on the final source, including local D1 integration, account/auth, checklist, shared design-system, detail-loading and viewport regression checks. Output: `validation.log`.
- Production Wrangler dry run: passed after verifying the account is `travelinkme@gmail.com`.
- Browser checks used actual document widths of 320, 390 and 430px. Account and To-do had no horizontal overflow; measured input/add controls were 52px and interactive targets were at least 44px.
- Account: guest profile, signed-in profile with long synthetic name/email, pending changes, all lower settings groups, support sheet, trip chooser, Travel eSIM and return navigation were inspected. Sheets retain the existing compact common shell.
- To-do: populated and empty lists, long trip/task names, add from input, add from suggestion, rename/save, cancel, complete/uncomplete, all completed, delete and Undo were exercised with local preview data. The first Undo attempt exceeded the existing toast lifetime; repeating within that lifetime restored the item successfully.
- Account deletion remained blocked by preview mode. No real account was deleted, no real sign-in was completed, and no production travel data was changed. Browser viewport checks are not a physical iPhone/Safari test.

## Local fixtures

```sh
TRIPTO_AUDIT_PORT=4196 TRIPTO_AUDIT_FIXTURE=scripts/design-audit/account-todo-fixture.js python3 scripts/design-audit/server.py
```

Open `/account?preview=1&qaState=account-signed-in`, or `/before-you-go?preview=1&qaState=checklist-empty` (also `checklist-complete` and `checklist-long`). The optional source injection is served only by this loopback test server and is never bundled into production assets.

Production publication and live checks are recorded separately in `release.json`.
