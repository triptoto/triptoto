import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), "utf8");
const index = read("index.html");
const privacy = read("privacy.html");
const terms = read("terms.html");
const cookies = read("cookies.html");
const contact = read("contact.html");
const legalCss = read("legal-page.css");
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const manifest = JSON.parse(read("manifest.webmanifest"));

assert.match(index, /<link rel="canonical" href="https:\/\/tripto\.to\/">/);
assert.match(index, /<meta name="robots" content="index, follow">/);
assert.match(index, /application\/ld\+json/);
assert.match(index, /fonts\.googleapis\.com\/css2\?family=Noto\+Sans/);
assert.match(index, /fonts\.gstatic\.com/);
assert.match(index, /--paper:#f6f4f1/);
assert.match(privacy, /<link rel="canonical" href="https:\/\/tripto\.to\/privacy">/);
assert.match(terms, /<link rel="canonical" href="https:\/\/tripto\.to\/terms">/);
assert.match(cookies, /<link rel="canonical" href="https:\/\/tripto\.to\/cookies">/);
assert.match(contact, /<link rel="canonical" href="https:\/\/tripto\.to\/contact">/);
for (const legal of [privacy, terms, cookies, contact]) {
  assert.match(legal, /<html lang="en" class="theme-beart">/);
  assert.match(legal, /<meta name="color-scheme" content="dark">/);
  assert.match(legal, /tripto_theme_v3/);
  assert.match(legal, /theme-day/);
  assert.match(legal, /theme===\"mono\"/);
  assert.match(legal, /theme-mono/);
  assert.match(legal, /fonts\.googleapis\.com\/css2\?family=Noto\+Sans/);
  assert.match(legal, /legal-page\.css\?v=legal-pages-v10-night/);
}
assert.match(legalCss, /--font:"Noto Sans"/);
assert.match(legalCss, /font-family:"Space Grotesk"/);
assert.match(legalCss, /\.theme-mono/);
assert.match(legalCss, /\.theme-day[^{]*\{color-scheme:light/);
assert.match(robots, /Sitemap: https:\/\/tripto\.to\/sitemap\.xml/);
for (const path of ["/", "/privacy", "/terms", "/cookies", "/contact"])
  assert.match(sitemap, new RegExp(`<loc>https:\\/\\/tripto\\.to${path === "/" ? "\\/" : path}<\\/loc>`));
assert.equal(manifest.background_color.toLowerCase(), "#f6f4f1");
assert.equal(manifest.theme_color.toLowerCase(), "#f6f4f1");

// Guard against the /privacy, /terms, /cookies and /contact 307 redirect loop: the worker rewrites
// the pretty URL to `${path}.html`, so Cloudflare Assets must not apply its own
// html_handling (auto-trailing-slash would redirect `/privacy.html` back to
// `/privacy`, fighting the worker rewrite forever).
const wranglerConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.match(
  wranglerConfig,
  /"html_handling"\s*:\s*"none"/,
  "Cloudflare Assets html_handling must be \"none\" so legal routes do not redirect-loop",
);

// Content-Security-Policy (defined in the worker, apps/worker/src/index.ts —
// moved out of _headers because the full allow-list + hashes exceed Cloudflare's
// 2000-char-per-line _headers limit) has no 'unsafe-inline' in script-src, so
// every inline <script> in a served HTML page must be allow-listed by its sha256
// hash. These scripts are deliberately deploy-independent (the asset-version token
// is read from a <meta> tag, not inlined), so the hashes are stable. If an inline
// script is edited without updating the CSP, it would silently break in
// production; this guard turns that into a loud test failure instead.
const workerSrc = readFileSync(new URL("../apps/worker/src/index.ts", import.meta.url), "utf8");
const scriptSrcLine = workerSrc.split("\n").find((line) => line.includes('"script-src')) || "";
assert.ok(scriptSrcLine, "could not find the script-src directive in apps/worker/src/index.ts");
const htmlPages = { "index.html": index, "privacy.html": privacy, "terms.html": terms, "cookies.html": cookies, "contact.html": contact };
for (const [name, html] of Object.entries(htmlPages)) {
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  for (const body of inlineScripts) {
    const hash = createHash("sha256").update(body, "utf8").digest("base64");
    assert.ok(
      scriptSrcLine.includes(`'sha256-${hash}'`),
      `CSP script-src is missing the hash for an inline <script> in ${name} (sha256-${hash}). Update CONTENT_SECURITY_POLICY in apps/worker/src/index.ts.`,
    );
  }
}
assert.ok(!scriptSrcLine.includes("'unsafe-inline'"), "script-src must not use 'unsafe-inline'");
// CSP must not linger in _headers (would be a stale/duplicate policy).
assert.ok(!read("_headers").includes("Content-Security-Policy"), "_headers must not define Content-Security-Policy; it lives in the worker");

// Agent Discoverability: ai-catalog.json MUST be valid JSON and MUST be served
// directly by the worker (not the asset bucket), because not_found_handling is
// "single-page-application" — a bucket miss would return index.html and agent
// validators reject "Unexpected token '<', "<!doctype "... is not valid JSON".
const aiCatalog = JSON.parse(read("ai-catalog.json"));
assert.equal(aiCatalog.spec, "ARD", "ai-catalog.json must declare the ARD spec");
assert.ok(Array.isArray(aiCatalog.resources) && aiCatalog.resources.length > 0, "ai-catalog.json must list resources");
assert.match(workerSrc, /path === '\/ai-catalog\.json'/, "worker must serve /ai-catalog.json directly so it never falls through to the SPA index.html");
assert.match(workerSrc, /import aiCatalog from '\.\.\/\.\.\/\.\.\/public\/ai-catalog\.json'/, "worker must import public/ai-catalog.json as the single source of truth");

console.log("SEO, canonical, public-page, Noto Sans, and Night PWA metadata contracts passed.");
