# Tripto canonical design system

This document is the browser-verification contract for the 2026-09-08 design audit. It describes the existing Elegant Flat Cards direction without changing routing, data, permissions, or product behavior.

## Foundations

| Token | Value | Use |
| --- | --- | --- |
| --paper | #FBF8F7 | Page canvas and app chrome. |
| --card | #FFFFFF | Meaningful grouped cards and sheets. |
| --ink / --navy | #05152D | Primary text and line icons. |
| --accent | #5547B7 | Links, selected states, focused controls, and normal primary actions. |
| --fab | #FBC840 | The single global Add action only. |
| --surface | #F3EFF0 | Inputs, segmented-control track, neutral icon tile, and subdued selection. |
| --flight-soft | #D9E4FB | Flight and document category tiles. |
| --stay-soft | #D1EDDE | Stay and neighborhood category tiles. |
| --activity-soft | #E7E1FB | Activities and planning category tiles. |
| --transfer-soft | #FEE4CF | Transfers and travel logistics category tiles. |
| --food-soft | #F8DDE3 | Food and reservation category tiles. |

Status colors remain semantic and must meet readable contrast against their assigned surface.

## Type, spacing, and surfaces

| Role | Contract |
| --- | --- |
| Page title | About 28px, deep navy, strong but not oversized; wraps instead of clipping. |
| Section title | About 20px, deep navy, semibold. |
| Row title / body | About 16px; title semibold, body regular. |
| Metadata / helper text | About 14px, muted but readable. |
| Label / status | About 12px with restrained uppercase only where it improves scanability. |
| Page padding | 16px on mobile. |
| Section rhythm | 24–32px between meaningful sections. |
| Card padding | 16–20px. |
| Card radius | 16px; 20–22px only for a justified hero or dialog. |
| Controls | 50–52px for ordinary fields and primary buttons; all interactive targets at least 44px in either dimension as appropriate. |

Cards are used to group a meaningful unit such as a summary, a choice set, a confirmed booking, or a form section. A label, a single row, or every action is not made into a card. Internal row dividers are inset and subtle.

## Shared primitives

| Primitive | Required behavior |
| --- | --- |
| PageShell / AppHeader | Shared 68px navigation row, 16px content alignment and safe areas. Form Save actions use a compact second row when needed. Booking details keep one header row; their Edit and Share actions live inside Menu. |
| HeaderNavigation | Adjacent 44px Add and Menu buttons on app pages. Menu retains four global links: All trips, Trip Options, To-Do List and Account. Booking details add compact contextual Edit, Share, Move to another day and Delete actions above those links; viewers see Share only. No bottom navigation or reserved bottom-bar space. All trips preserves its Account / Create trip header. Neighborhood Add continues to add a place. Closing Menu preserves forms and focus. |
| HeroSummary | Optional contextual summary with a single pastel background, no gradient, illustration, or heavy shadow. |
| GroupedCard / choice tile | White or neutral-surface grouping with a 1px subtle border, 16px radius, 16–20px padding, and no nested decorative card. |
| FlatList / FlatRow | Default operational list: one icon tile, title, optional metadata/status, and a clear touch target. Use dividers only when they help scan adjacent rows. |
| PastelIcon | Same line-icon family; 40px pastel tile in the category tone; no emoji substitutes. |
| SegmentedControl | Neutral-surface track, white selected segment, 44px targets, text never clipped. |
| Button / IconButton | Primary purple, secondary outlined or neutral, destructive semantic red, and the single global Add action yellow. No dense shadow styling. |
| FormField | Shared 50–52px control, visible label, validation message below its field, wrapping helper copy, clear focus ring. |
| StatusLabel | Semantically colored text/badge; it must never be the only cue. |
| BottomSheet | Purpose-sized, compact white sheet with handle, close button, consistent rows, internal scrolling, and no row-divider rails. |
| Dialog | Bounded white confirmation dialog with clear destructive emphasis and safe cancel action. |
| Toast / Notice | One position and one compact visual hierarchy; error, warning, and success use wording plus semantic color/icon. |
| EmptyState / LoadingState / ErrorState | Centered, readable, icon + title + explanatory copy, with one action when recovery exists. |

## Overlay family

| Variant | Intended use | Required interaction |
| --- | --- | --- |
| Compact action sheet | Choose, manage, or reorder an item. | Dim backdrop, focus enters, Escape / explicit close works, focus returns to trigger, internal scrolling for long content. |
| Picker sheet | Currency, trip selection, short bounded selection list. | Same shell, selected state visible, list can scroll without hiding title or close control. |
| Full-screen picker / form | Destination search and calendar interaction needing keyboard space. | App header or clear back control, own scrolling region, visible saving / validation state. |
| Confirmation dialog | Destructive or irreversible decision. | Focus trap, clear Cancel / destructive action, no background scrolling, safe cancel returns focus. |
| Full-screen functional mode | Document viewer and Show to Driver. | Function-specific canvas is allowed; surrounding header, type, controls, and safe areas retain this system. |

## Justified exceptions

- Maps, document previews, QR codes, attachments, and browser/OS-managed pickers may use function-specific content areas. They are not decorative imagery.
- The Welcome journey and Show to Driver can use a purpose-built composition, but may not introduce a new type scale, unrelated button system, decorative image banner, gradient, or competing navigation grammar.
- Dense timelines use the main timeline’s type and rail geometry; Neighborhood timelines use numbers rather than category icons and do not show redundant trailing chevrons.
- Longer text grows rows and cards. Fixed heights may standardize controls, never user content.

## Audit implementation rules

1. Fix the shared primitive or token first.
2. Use page-specific selectors only for a real semantic exception.
3. Do not add an override layer merely to outrank another override.
4. Remove superseded declarations once browser evidence proves the replacement.
5. Rebuild the minified shell after CSS or renderer changes.
6. Verify each changed primitive at 320px, 390px, and 430px before it is marked verified.
