import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../public/mobile-app.css", import.meta.url), "utf8");

for (const token of [
  "--button-compact-height:44px",
  "--button-secondary-height:48px",
  "--button-primary-height:52px",
  "--button-row-height:64px",
]) {
  assert(css.includes(token), `missing shared button token: ${token}`);
}

assert(
  css.includes("min-height:var(--button-primary-height)"),
  "primary actions must use the shared primary height",
);
assert(
  css.includes("min-height:var(--button-secondary-height)"),
  "secondary actions must use the shared secondary height",
);
assert(
  css.includes("min-height:var(--button-compact-height)"),
  "compact controls must preserve a 44px touch target",
);
assert(
  css.includes("min-height:var(--button-row-height)"),
  "button rows must use the shared row height",
);
assert(
  !/(?:^|})\.mobile-secondary-action\{margin-top:14px}/m.test(css),
  "secondary actions must not carry a global margin that breaks grouped alignment",
);
assert(
  css.includes(
    ".discard-dialog-actions .mobile-primary-action,.discard-dialog-actions .mobile-secondary-action{min-height:var(--button-secondary-height);margin:0",
  ),
  "discard actions must be equal-height and aligned",
);
assert(
  css.includes(".segmented-control button{min-height:var(--button-compact-height)"),
  "segmented controls must meet the compact touch target",
);
assert(
  css.includes(".traveler-pill span{display:inline-flex;align-items:center;min-height:var(--button-compact-height)"),
  "traveler chips must meet the compact touch target",
);

console.log("Button sizing contract passed.");
