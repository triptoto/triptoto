import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(path, "utf8");
const app = read("public/mobile-app.js");
const parseAmountSource = app.slice(app.indexOf("  function parseAmountInput("), app.indexOf("  function currencyCacheKey("));
const parseAmountInput = runInNewContext(`(${parseAmountSource.trim()})`);
assert.equal(parseAmountInput("1.234,56"), 1234.56, "European grouped amounts must parse");
assert.equal(parseAmountInput("1,000"), 1000, "Thousands separators must not truncate amounts");
assert.equal(parseAmountInput("12,5"), 12.5, "Comma decimals must parse");
const css = read("public/mobile-app.css");
const routes = read("public/mobile-routes.js");
const worker = read("apps/worker/src/index.ts");
const currency = read("apps/worker/src/routes/currency.ts");
const icons = read("scripts/build-icon-sprite.mjs");

assert(routes.includes('currency: "/currency"'), "Currency route is missing");
assert(app.includes('"Currency converter"') && app.includes('data-action="open-currency"'), "Trip options entry is missing");
assert(app.includes('data-currency-amount') && app.includes('data-action="open-currency-picker"') && app.includes('data-action="select-currency"'), "Compact converter controls are missing");
assert(app.includes('class="currency-page currency-journey"') && app.includes('class="currency-route"') && app.includes('class="currency-card currency-entry"') && app.includes('class="currency-ticket"'), "Currency Journey route, amount workspace, or result ticket is missing");
assert(app.includes('CURRENCY_UI_COPY') && ['en','de','fr','es','ru'].every(locale => app.includes(`${locale}:{direction:`)), "Currency Journey copy must cover every supported locale");
assert(app.includes('role="listbox"') && app.includes('role="option"') && !app.includes('data-currency-field="from"'), "Currency selection must use the accessible custom picker instead of the native full-screen select");
assert(app.includes("tripto_currency_rate_v1:") && app.includes("Saved offline"), "Offline currency cache is missing");
assert(app.includes("Amounts are calculated on this phone") && !app.includes("amount=${encodeURIComponent"), "Amounts must remain on-device");
assert(app.includes("amountInput") && app.includes("currency.amountText = rawAmount"), "Currency input must preserve an intentionally empty amount");
assert(worker.includes("/api/v1/currency") && worker.includes("currencyRates"), "Currency API route is missing");
assert(currency.includes("api.frankfurter.dev/v2/rates") && currency.includes("institutional reference rates"), "Reference-rate provider is missing");
assert(css.includes(".currency-page") && css.includes(".currency-result") && css.includes("Currency Journey") && css.includes(".currency-route__currency") && css.includes(".currency-ticket__footer") && css.includes("@media(max-width:374px)"), "Responsive Currency Journey styling is missing");
assert(icons.includes('currency: "currency-circle-dollar"') && icons.includes('swap: "arrows-left-right"'), "Phosphor currency icons are missing");

// Exercise the actual input handler: an unloaded rate must never turn into
// a fictitious zero conversion when the user types an amount.
const inputHandler = app.slice(app.indexOf('    const input = event.target.closest?.("[data-currency-amount]");'));
const inputBody = inputHandler.slice(0, inputHandler.indexOf('\n  });'));
for (const rate of [null, undefined, NaN, 1.25]) {
  const currencyState = { rate, from: "EUR", to: "USD", amount: 0 };
  const classes = () => ({ toggle() {} });
  const input = { value: "100", classList: classes() };
  const result = { textContent: "", classList: classes() };
  const note = { textContent: "" };
  const onInput = runInNewContext(`(event) => { ${inputBody} }`, {
    initCurrency: () => currencyState,
    parseAmountInput,
    saveCurrencyPreferences() {},
    app: { querySelector: selector => selector === ".currency-result__amount" ? result : note, querySelectorAll: () => [] },
  });
  onInput({ target: { closest: () => input } });
  assert.equal(result.textContent, rate === 1.25 ? "$125.00" : "—", "Missing rates must remain unavailable after editing");
  assert.equal(note.textContent, rate === 1.25 ? "1 EUR = 1.250 USD" : "Update to load this rate");
}

// Clearing the default amount is a valid editing state. It must remain blank
// in state and produce no fictitious conversion.
{
  const currencyState = { rate: 1.25, from: "EUR", to: "USD", amount: 100, amountText: "100" };
  const classes = () => ({ toggle() {} });
  const input = { value: "", classList: classes() };
  const result = { textContent: "", classList: classes() };
  const note = { textContent: "" };
  const onInput = runInNewContext(`(event) => { ${inputBody} }`, {
    initCurrency: () => currencyState,
    parseAmountInput,
    saveCurrencyPreferences() {},
    app: { querySelector: selector => selector === ".currency-result__amount" ? result : note, querySelectorAll: () => [] },
  });
  onInput({ target: { closest: () => input } });
  assert.equal(currencyState.amount, 0, "An empty amount must calculate as zero");
  assert.equal(currencyState.amountText, "", "An empty amount must remain empty instead of reverting to 100");
  assert.equal(result.textContent, "$0.00", "A loaded rate should reflect the cleared amount");
}
console.log("currency contract and unloaded-rate input regression: ok");
