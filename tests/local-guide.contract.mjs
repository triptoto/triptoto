import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(path, "utf8");
const app = read("public/mobile-app.js");
const css = read("public/mobile-app.css");
const routesSource = read("public/mobile-routes.js");
const icons = read("scripts/build-icon-sprite.mjs");

const context = {};
runInNewContext(routesSource, context);
assert.equal(context.TriptoRoutes.pathFor("local-guide"), "/local-guide");
assert.equal(context.TriptoRoutes.parsePath("/local-guide").screen, "local-guide");
assert(app.includes('data-screen="local-guide"') && app.includes('case "local-guide": html = localGuideScreen()'), "Local Guide route is not connected");
assert(app.includes('data-action="local-guide-search"') && app.includes('case "local-guide-search":'), "Local Guide search actions are missing");
assert(app.includes("getMappableTripLocations().slice(0,4)") && app.includes("destinationCurrency()"), "Local Guide does not use trip context");
assert(app.includes("not recommendations from tripto.to") && !app.includes("navigator.geolocation"), "Local Guide privacy or recommendation boundary changed");
for (const selector of [".local-guide-hero", ".local-guide-grid", ".local-guide-category", ".local-guide-place"])
  assert(css.includes(selector), `Local Guide styling missing: ${selector}`);
assert(icons.includes('guide: "compass"'), "Local Guide Phosphor compass icon is missing");

console.log("Local Guide contract passed.");
