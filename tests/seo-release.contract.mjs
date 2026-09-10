import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");
const index = read("index.html");
const privacy = read("privacy.html");
const terms = read("terms.html");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const manifest = JSON.parse(read("manifest.webmanifest"));

assert.match(index, /<link rel="canonical" href="https:\/\/tripto\.to\/">/);
assert.match(index, /<meta name="robots" content="index, follow">/);
assert.match(index, /application\/ld\+json/);
assert.match(index, /fonts\.googleapis\.com\/css2\?family=Noto\+Sans/);
assert.match(index, /fonts\.gstatic\.com/);
assert.match(index, /--paper:#0f1f29/);
assert.match(privacy, /<link rel="canonical" href="https:\/\/tripto\.to\/privacy">/);
assert.match(terms, /<link rel="canonical" href="https:\/\/tripto\.to\/terms">/);
for (const legal of [privacy, terms]) {
  assert.match(legal, /<meta name="color-scheme" content="dark">/);
  assert.match(legal, /fonts\.googleapis\.com\/css2\?family=Noto\+Sans/);
  assert.match(legal, /--font:"Noto Sans"/);
}
assert.match(robots, /Sitemap: https:\/\/tripto\.to\/sitemap\.xml/);
for (const path of ["/", "/privacy", "/terms"])
  assert.match(sitemap, new RegExp(`<loc>https:\\/\\/tripto\\.to${path === "/" ? "\\/" : path}<\\/loc>`));
assert.equal(manifest.background_color.toLowerCase(), "#0f1f29");
assert.equal(manifest.theme_color.toLowerCase(), "#0f1f29");

// Guard against the /privacy & /terms 307 redirect loop: the worker rewrites
// the pretty URL to `${path}.html`, so Cloudflare Assets must not apply its own
// html_handling (auto-trailing-slash would redirect `/privacy.html` back to
// `/privacy`, fighting the worker rewrite forever).
const wranglerConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.match(
  wranglerConfig,
  /"html_handling"\s*:\s*"none"/,
  "Cloudflare Assets html_handling must be \"none\" so /privacy and /terms do not redirect-loop",
);

console.log("SEO, canonical, public-page, Noto Sans, and Night PWA metadata contracts passed.");
