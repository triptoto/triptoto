# Simple To-do — v247

To-do now opens with the trip name, a short remaining-task count, one add field and the unfinished list. The separate progress card, repeated section counts and suggestion chips were removed. Completed tasks sit behind a single expandable row and can be returned to the active list.

The existing theme, grouped card, checkbox, inline editor and bottom navigation remain. Add uses an explicit text label and is disabled for blank/whitespace-only input. Both the field and Add button are 52px tall. Standard task rows are 56px tall, with an additional 1px separator where applicable; editing and disclosure targets remain at least 44px.

Changing another task now preserves the add form and its draft. Expanding/collapsing Completed changes visibility in place, preserving both add and rename drafts. Delete and Undo use the existing checklist DOM update path. Backend mutation, offline queue and authorization behavior are unchanged.

## Verification

- `npm run validate:v2`: passed on the final application source, including `check:ui`, type checking, local D1 integration, authentication, checklist, design-system, loading and viewport regressions. Full output is in `validation.log`.
- Added executable checklist cases for pending/completed counts, empty/all-done states, trip-scoped expansion and disclosure without discarding drafts.
- Local browser checks used the actual application with the existing loopback-only checklist fixture. Exercised blank/whitespace input, Add, field clearing/refocus, rename/save/cancel, completion, return from Completed, delete/Undo and the first-task/all-done transitions.
- Verified a pending add draft survives opening an editor, Cancel, completion, uncompletion, Delete and Undo. Both add and rename drafts survived collapsing/reopening Completed.
- At 320px, a long trip name and 77-character task wrapped without horizontal overflow. The inline rename field was 254px wide; Delete, Cancel and Save remained at least 44px tall.
- At 390px, document width and scroll width both measured 390px; input/Add were 52px, standard rows 56–57px, edit buttons 44×44px and completed disclosure 44px tall.
- At 430px, the empty state and first-task/all-done transitions had no horizontal overflow; input/Add remained 52px tall.
- No browser console errors were observed during these local checks. Browser viewport checks do not substitute for testing a physical iPhone keyboard.

## Release

The service-worker cache is `tripto-shell-product-v247-simple-todo`; both generated asset URLs use `flat-design-system-v169`. Production publication and live verification are recorded separately in `release.json`.

Local fixture command:

```sh
TRIPTO_AUDIT_PORT=4196 TRIPTO_AUDIT_FIXTURE=scripts/design-audit/account-todo-fixture.js python3 scripts/design-audit/server.py
```

Open `/before-you-go?preview=1`, with optional `qaState=checklist-empty` or `qaState=checklist-long`. The fixture is not bundled into production assets.
