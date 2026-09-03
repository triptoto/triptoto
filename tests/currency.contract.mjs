import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const app = read("public/mobile-app.js");
const css = read("public/mobile-app.css");
const routes = read("public/mobile-routes.js");
const worker = read("apps/worker/src/index.ts");
const currency = read("apps/worker/src/routes/currency.ts");
const icons = read("scripts/build-icon-sprite.mjs");

assert(routes.includes('currency: "/currency"'), "Currency route is missing");
assert(app.includes('"Currency converter"') && app.includes('data-action="open-currency"'), "Trip options entry is missing");
assert(app.includes('data-currency-amount') && app.includes('data-action="open-currency-picker"') && app.includes('data-action="select-currency"'), "Compact converter controls are missing");
assert(app.includes('role="listbox"') && app.includes('role="option"') && !app.includes('data-currency-field="from"'), "Currency selection must use the accessible custom picker instead of the native full-screen select");
assert(app.includes("tripto_currency_rate_v1:") && app.includes("Saved offline"), "Offline currency cache is missing");
assert(app.includes("Amounts are calculated on this phone") && !app.includes("amount=${encodeURIComponent"), "Amounts must remain on-device");
assert(worker.includes("/api/v1/currency") && worker.includes("currencyRates"), "Currency API route is missing");
assert(currency.includes("api.frankfurter.dev/v2/rates") && currency.includes("institutional reference rates"), "Reference-rate provider is missing");
assert(css.includes(".currency-page") && css.includes(".currency-result") && css.includes("@media(max-width:374px)"), "Responsive converter styling is missing");
assert(icons.includes('currency: "currency-circle-dollar"') && icons.includes('swap: "arrows-left-right"'), "Phosphor currency icons are missing");

console.log("currency contract: ok");
