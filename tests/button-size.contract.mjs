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
assert(
  css.includes(".collab-chip{display:inline-flex;align-items:center;gap:5px;min-height:var(--button-compact-height)"),
  "collaboration actions must meet the compact touch target",
);

assert(
  css.includes("html .bottom-nav .nav-item{color:var(--muted);font-size:12px;font-weight:600;min-height:var(--button-compact-height);height:auto"),
  "production bottom navigation items must preserve the 44px touch target",
);

function channel(value) {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  return channels.reduce(
    (total, value, index) => total + channel(value) * [0.2126, 0.7152, 0.0722][index],
    0,
  );
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

const productionTokens = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf(":root{")) + 1);
const productionGreen = productionTokens.match(/--green:(#[0-9a-f]{6})/i)?.[1];
const productionPaper = productionTokens.match(/--paper:(#[0-9a-f]{6})/i)?.[1];
const productionAccent = productionTokens.match(/--accent:(#[0-9a-f]{6})/i)?.[1];

assert(productionGreen, "production Ready Offline status color is missing");
assert(productionPaper, "production page color is missing");
assert(productionAccent, "production notification accent is missing");
assert(contrast(productionGreen, productionPaper) >= 4.5, "Ready Offline text must meet WCAG AA on the production page");
assert(contrast("#ffffff", productionAccent) >= 4.5, "header notification badge must meet WCAG AA");
assert(contrast("#ffffff", productionAccent) >= 4.5, "bottom-nav notification badge must meet WCAG AA");

console.log("Button sizing contract passed.");
