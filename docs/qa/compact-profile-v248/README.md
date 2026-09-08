# Compact Account profile — v248

Only the Account profile card layout changed. Sign out now shares the identity row, the avatar is 40px, card padding is 12px and trip counts use one inline row without the separate filled statistics panel. The name is 16px; email and counts retain the theme's 14px metadata size.

Long names/emails use ellipsis to preserve the compact layout. Their complete values remain in the DOM/accessibility tree and title attributes. The existing Sign out handler and its pending-changes confirmation are unchanged. Other Account sections and To-do are unchanged.

## Verification

- Before/after at a 390px document viewport with the same synthetic signed-in profile: card height fell from 213.79px to 96.20px, about 55% less.
- Actual browser widths: 320, 390 and 430px. The final signed-in card remains 96.20px tall, including the long-name/email fixture at 320px. The guest card at 390px measures 94.59px.
- Checked the scrolling main element as well as document width. The final long-profile layout has no horizontal overflow; the visible desktop scrollbar accounts for the 15px difference between document and main width.
- Sign out retains a 44px-high target. Its pending-changes confirmation opened successfully and Cancel returned to the profile. No real sign-out or account deletion was performed.
- Full text remained available in the accessibility tree when visually truncated. Guest mode did not expose Sign out.
- `npm run check:ui` and `node tests/smart-import-auth.contract.mjs`: passed on final source. No new behavior tests were added for this layout-only change. Output: `validation.log`.
- Browser console errors: none observed in local checks. This is browser viewport verification, not a physical iPhone test.

The local-only fixture adds `qaState=account-compact` alongside the existing `account-signed-in` long-profile fixture. It is not bundled into production.

Cache: `tripto-shell-product-v248-compact-profile`; generated asset URLs: `flat-design-system-v170`. Publication and public checks are recorded in `release.json`.
