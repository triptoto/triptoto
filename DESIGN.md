# Tripto Design System

## North Star

Tripto is a calm, optimistic mobile travel organizer. It should make a complicated trip feel clear at a glance. The interface uses real travel structure—days, routes, bookings, places, and documents—as its visual language.

## Visual identity

- Use the existing Tripto token system in `public/mobile-app.css` as the runtime source of truth.
- Night is Tripto's only theme. Keep its deep slate canvas, light text, amber accent, and category colors; do not add an appearance selector.
- Use the native system font stack for fast, private, offline-safe rendering and a familiar iOS feel.
- Use the restrained amber accent. Category colors communicate booking type and must also have a text or icon cue.
- Prefer flat surfaces, subtle borders, and compact grouped rows. Avoid glass effects, arbitrary gradients, and ornamental shadows.

## Type

- Page questions and primary empty-state prompts may use the display scale.
- Screen content has one clear `h1`; section headings use `h2`; row titles use the shared body scale.
- Timeline and detail titles are compact, semibold, and allowed to wrap when the full value matters.
- Labels and metadata remain readable at 12px or larger and use sufficient contrast on the Night surfaces.

## Layout and spacing

- Design mobile-first for 320px, 390px, and 430px document widths.
- Interactive controls are at least 44 by 44 CSS pixels.
- Use the shared spacing, radius, control-height, row-height, and card tokens.
- Avoid decorative empty space. Space must separate hierarchy, protect a touch target, or improve scanning.
- Fixed and sticky controls must account for safe areas and the visual keyboard.

## Navigation

- Trips: Account and Create trip.
- Trip timeline: Notifications, Add, and Menu.
- Create/edit forms: Back and the contextual Save or Next action.
- Detail and utility pages: Back plus only actions that apply to that page.
- Sheets: title, close action, internal scrolling, and a dimmed inert background.

## Components

- `HeaderNavigation`, `appBar`, and `focusedTaskPage` own page chrome.
- `bottomSheet`, `sheetActionList`, and `sheetActionRow` own popup geometry and action rows.
- Shared form, date-range, grouped-card, flat-row, toast, and confirmation primitives must be extended rather than recreated per screen.
- Primary actions use the amber accent. Destructive actions are separated and use the danger treatment.

## Motion and feedback

- Use brief motion for state changes, one focal celebration, and intentional long-press feedback.
- Respect `prefers-reduced-motion` everywhere.
- Loading, success, error, offline, and disabled states keep stable geometry.
- Focus is visible on every Night surface and never relies on color alone.

## Content

- Use concise sentence case and plain travel language.
- Keep action wording consistent from button through result: Save, Create trip, Delete, Move, Share.
- Errors explain what happened and what the traveler can do next.
- Never invent travel details or hide unavailable/stale data.

## Anti-references

- Generic SaaS dashboards, glassmorphism, decorative gradients, emoji icons, oversized empty heroes, tiny icon targets, duplicated navigation, and page-specific popup systems.

## Verification

- Run the project UI contracts and inspect representative screens at 320x568, 390x844, and 430x932.
- Verify the Night theme, reduced motion, keyboard-visible forms, long text, empty/error/loading states, and open sheets.
- Rebuild minified shell assets and update the service-worker cache token before release.
