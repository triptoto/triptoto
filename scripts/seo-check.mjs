#!/usr/bin/env node
// npm run seo:check — the complete technical-SEO suite. Runs offline against the
// real worker routing (apps/worker/src) with an assets binding backed by public/,
// so it checks what production serves, not just the files. Prints a PASS/FAIL
// table and exits 1 on any failure.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import worker from "../apps/worker/src/index.ts";
import { SEO_SITE, indexNowRequestBody, runIndexNow, submitIndexNow, siteVerificationMeta, submittableUrls } from "../apps/worker/src/seo.ts";
import manifest from "../seo/manifest.json" with { type: "json" };

const root = new URL("..", import.meta.url).pathname;
const pub = (file) => join(root, "public", file);
const read = (file) => readFileSync(pub(file), "utf8");
const ORIGIN = SEO_SITE.origin;
const NOINDEX = "noindex, nofollow";
const MIME = { ".html": "text/html", ".txt": "text/plain", ".xml": "application/xml", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

// Cloudflare Assets stand-in: real files with their type; anything missing gets
// index.html with 200, exactly like not_found_handling: single-page-application.
const ASSETS = {
  async fetch(request) {
    const path = decodeURIComponent(new URL(request.url).pathname);
    const file = path === "/" ? "index.html" : path.slice(1);
    if (file && existsSync(pub(file)) && !file.endsWith("/")) {
      return new Response(readFileSync(pub(file)), { headers: { "Content-Type": MIME[extname(file)] || "application/octet-stream" } });
    }
    return new Response(read("index.html"), { headers: { "Content-Type": "text/html" } });
  },
};
const baseEnv = { ASSETS, APP_BASE_URL: ORIGIN };
const serve = (url, init = {}, env = baseEnv) => worker.fetch(new Request(url, init), env);

const pages = SEO_SITE.pages.map((page) => ({ ...page, url: ORIGIN + page.path, html: read(page.file) }));
const robots = read("robots.txt");
const sitemap = read("sitemap.xml");
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name.replace(/[.:]/g, "\\$&")}" content="([^"]*)"`))?.[1];
const routesSrc = read("mobile-routes.js");
const clientStatic = routesSrc.slice(routesSrc.indexOf("STATIC_PATHS"), routesSrc.indexOf("DETAIL_PATHS"));
const clientSegments = [...new Set([...clientStatic.matchAll(/:\s*"\/([a-z0-9-]+)/gi)].map((m) => m[1]))];
const privateSamples = [...SEO_SITE.appRoutes.map((segment) => `/${segment}`), "/trips/example-trip", "/join/invite-token-example", "/documents/doc-1", "/bookings/booking-1"];

// Minimal D1 stand-in for the IndexNow state rows (usage_counters).
function fakeDb() {
  const rows = new Map();
  const stmt = (sql, args) => ({
    async all() { return { results: [...rows.entries()].filter(([k]) => k.startsWith(`${args[0]}|`)).map(([k, v]) => ({ period_key: k.split("|")[1], ...v })) }; },
    async first() {
      if (!sql.includes("'lock'")) return null;
      const [scope, now, staleBefore] = args, key = `${scope}|lock`, row = rows.get(key);
      if (row && row.updated_at >= staleBefore) return null;
      rows.set(key, { value: 0, updated_at: now });
      return { value: 0 };
    },
    async run() {
      if (sql.startsWith("UPDATE")) { for (const [k, v] of rows) if (k.startsWith(`${args[1]}|page:`)) v.updated_at = args[0]; }
      else if (sql.startsWith("DELETE")) rows.delete(`${args[0]}|${args[1]}`);
      else if (sql.startsWith("INSERT")) rows.set(`${args[0]}|${args[1]}`, { value: args[2], updated_at: args[3] });
      return { meta: {} };
    },
  });
  return { rows, prepare: (sql) => ({ bind: (...args) => stmt(sql, args) }) };
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const must = (condition, message) => { if (!condition) throw new Error(message); };

check("robots.txt: valid rules + Sitemap line", () => {
  must(/^User-agent: \*$/m.test(robots), "missing User-agent: *");
  must(robots.includes(`Sitemap: ${ORIGIN}/sitemap.xml`), "missing absolute Sitemap line");
});
check("robots.txt: every private app route disallowed", () => {
  const missing = [...new Set([...SEO_SITE.appRoutes, ...clientSegments])].filter((segment) => !robots.includes(`Disallow: /${segment}\n`));
  must(!missing.length, `not disallowed: ${missing.join(", ")}`);
});
check("robots.txt: no public page blocked", () => {
  const rules = [...robots.matchAll(/^Disallow: (\S+)$/gm)].map((m) => m[1]);
  const blocked = pages.filter((page) => rules.some((rule) => rule === "/" || page.path === rule || page.path.startsWith(rule + "/")));
  must(!blocked.length, `blocked: ${blocked.map((page) => page.path).join(", ")}`);
});
check("sitemap.xml: valid, canonical https URLs, lastmod", () => {
  must(sitemap.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && sitemap.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'), "bad XML header/namespace");
  must((sitemap.match(/<url>/g) || []).length === sitemapUrls.length, "malformed <url> entries");
  must(sitemapUrls.every((url) => url.startsWith(`${ORIGIN}/`) && !url.includes("?") && !url.includes("#")), "non-canonical URL");
  must(new Set(sitemapUrls).size === sitemapUrls.length, "duplicate URLs");
  must([...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].every((m) => /^\d{4}-\d{2}-\d{2}$/.test(m[1])), "bad lastmod");
});
check("sitemap.xml: exactly the public pages, no private routes", () => {
  must(JSON.stringify(sitemapUrls) === JSON.stringify(pages.map((page) => page.url)), "sitemap differs from seo/site.json pages");
  const leaked = sitemapUrls.filter((url) => SEO_SITE.appRoutes.some((segment) => new URL(url).pathname.split("/")[1] === segment) || url.includes("/api/"));
  must(!leaked.length, `private URL in sitemap: ${leaked.join(", ")}`);
});
check("sitemap + robots + manifest + key are generated and current", () => {
  execFileSync(process.execPath, [join(root, "scripts/seo-build.mjs"), "--check"], { stdio: "pipe" });
});
check("every sitemap URL returns 200 HTML, indexable", async () => {
  for (const url of sitemapUrls) {
    const response = await serve(url);
    must(response.status === 200, `${url} -> ${response.status}`);
    must((response.headers.get("Content-Type") || "").includes("text/html"), `${url} not HTML`);
    must(!response.headers.get("X-Robots-Tag"), `${url} has X-Robots-Tag`);
  }
});
check("unique titles", () => {
  const titles = pages.map((page) => page.html.match(/<title>([^<]+)<\/title>/)?.[1]);
  must(titles.every((title) => title && title.length >= 10 && title.length <= 70), "missing or out-of-range title (10-70 chars)");
  must(new Set(titles).size === titles.length, "duplicate titles");
});
check("unique meta descriptions", () => {
  const descriptions = pages.map((page) => meta(page.html, "name", "description"));
  must(descriptions.every((d) => d && d.length >= 50 && d.length <= 170), "missing or out-of-range description (50-170 chars)");
  must(new Set(descriptions).size === descriptions.length, "duplicate descriptions");
});
check("canonical: absolute, self-referencing, matches sitemap", () => {
  for (const page of pages) {
    const canonicals = [...page.html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]);
    must(canonicals.length === 1 && canonicals[0] === page.url, `${page.path}: canonical ${canonicals.join(",") || "missing"}`);
  }
});
check("meta robots index,follow on public pages; noindex on 404 page", () => {
  for (const page of pages) must(meta(page.html, "name", "robots") === "index, follow", `${page.path}: meta robots`);
  must(meta(read("404.html"), "name", "robots") === "noindex, nofollow", "404.html must be noindex");
});
check("Open Graph + Twitter complete, absolute URLs", () => {
  for (const page of pages) {
    for (const name of ["og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image"]) must(meta(page.html, "property", name), `${page.path}: ${name}`);
    for (const name of ["twitter:card", "twitter:title", "twitter:description", "twitter:image"]) must(meta(page.html, "name", name), `${page.path}: ${name}`);
    must(meta(page.html, "property", "og:url") === page.url, `${page.path}: og:url != canonical`);
    for (const image of [meta(page.html, "property", "og:image"), meta(page.html, "name", "twitter:image")]) {
      must(image.startsWith(`${ORIGIN}/`) && existsSync(pub(new URL(image).pathname.slice(1))), `${page.path}: image ${image} not absolute/existing`);
    }
  }
});
check("JSON-LD: valid, allowed types, no fake ratings/reviews", () => {
  const allowed = new Set(["WebSite", "Organization", "WebApplication", "SoftwareApplication", "WebPage", "BreadcrumbList", "Offer"]);
  for (const page of pages) {
    for (const [, body] of page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const data = JSON.parse(body);
      const text = JSON.stringify(data);
      must(!/aggregateRating|"review"|ratingValue/i.test(text), `${page.path}: rating/review markup`);
      const types = [...text.matchAll(/"@type":"([^"]+)"/g)].map((m) => m[1]);
      must(types.every((type) => allowed.has(type)), `${page.path}: unexpected @type ${types.join(",")}`);
      for (const [, price] of text.matchAll(/"price":"([^"]*)"/g)) must(price === "0", `${page.path}: non-zero price ${price} in JSON-LD`);
    }
  }
});
check("hreflang: only for real locales, reciprocal; html lang set", () => {
  for (const page of pages) {
    must(/<html lang="[a-z]{2}/.test(page.html), `${page.path}: html lang`);
    const alternates = [...page.html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)];
    if (!alternates.length) continue;
    must(alternates.some((m) => m[1] === "x-default"), `${page.path}: hreflang without x-default`);
    for (const [, , href] of alternates) {
      const target = pages.find((other) => other.url === href);
      must(target && target.html.includes(`href="${page.url}"`), `${page.path}: hreflang to ${href} not reciprocal`);
    }
  }
});
check("crawlable without JS: h1 + links to public pages", () => {
  for (const page of pages) {
    must(/<h1[\s>]/.test(page.html), `${page.path}: no h1 in static HTML`);
    must(/href="\/(?:privacy|terms|cookies|contact)?"/.test(page.html), `${page.path}: no static links to public pages`);
  }
});
check("internal links resolve (no broken/soft-404 links)", async () => {
  for (const page of pages) {
    for (const [, href] of page.html.matchAll(/<a [^>]*href="(\/[^"#]*)/g)) {
      const response = await serve(ORIGIN + href);
      must([200, 301].includes(response.status), `${page.path} links to ${href} -> ${response.status}`);
    }
  }
});
check("private routes: app shell + X-Robots-Tag noindex", async () => {
  for (const path of privateSamples) {
    const response = await serve(ORIGIN + path);
    must(response.status === 200 && response.headers.get("X-Robots-Tag") === NOINDEX, `${path} -> ${response.status} ${response.headers.get("X-Robots-Tag")}`);
  }
});
check("HTTP status: unknown URL 404, missing asset 404 (no soft 404s)", async () => {
  for (const path of ["/definitely-not-a-page", "/missing-file.png", "/missing-key.txt", "/landing/nope"]) {
    const response = await serve(ORIGIN + path);
    must(response.status === 404 && response.headers.get("X-Robots-Tag") === NOINDEX, `${path} -> ${response.status}`);
  }
});
check("www -> apex and http -> https: single 301, no loop", async () => {
  for (const from of ["https://www.tripto.to/privacy?x=1", "http://tripto.to/privacy?x=1", "http://www.tripto.to/privacy?x=1"]) {
    const response = await serve(from, { redirect: "manual" });
    must(response.status === 301 && response.headers.get("Location") === `${ORIGIN}/privacy?x=1`, `${from} -> ${response.status} ${response.headers.get("Location")}`);
    const next = await serve(response.headers.get("Location"));
    must(next.status === 200, `redirect target -> ${next.status}`);
  }
  const post = await serve("https://www.tripto.to/api/v1/session/guest", { method: "POST" });
  must(post.status === 308, `www POST -> ${post.status} (want 308)`);
});
check("duplicate + retired paths 301 to canonical; /index.html canonical to /", async () => {
  for (const [from, to] of [["/landing", "/"], ["/landing/", "/"], ["/landing.html", "/"], ["/privacy/", "/privacy"], ["/terms.html", "/terms"], ["/delete-account/", "/delete-account"]]) {
    const response = await serve(ORIGIN + from);
    must(response.status === 301 && response.headers.get("Location") === to, `${from} -> ${response.status} ${response.headers.get("Location")}`);
  }
  const index = await serve(`${ORIGIN}/index.html`);
  must(index.status === 200 && (await index.text()).includes(`<link rel="canonical" href="${ORIGIN}/">`), "/index.html must stay 200 with canonical /");
  const home = await (await serve(`${ORIGIN}/`)).text();
  must(home === read(SEO_SITE.pages.find((page) => page.path === "/").file), "/ must serve the landing page");
  const welcome = await serve(`${ORIGIN}/welcome`);
  must(welcome.status === 200 && (await welcome.text()) === read("index.html"), "/welcome must serve the app shell");
});
check("non-production hosts (workers.dev, preview) are noindex", async () => {
  for (const host of ["https://tripto-api.travelinkme.workers.dev", "https://tripto-api-preview.travelinkme.workers.dev", "http://localhost:8787"]) {
    for (const path of ["/", "/welcome", "/privacy", "/sitemap.xml", "/trips"]) {
      const response = await serve(host + path);
      must(response.headers.get("X-Robots-Tag") === NOINDEX, `${host}${path} not noindex`);
    }
    const robotsTxt = await (await serve(`${host}/robots.txt`)).text();
    must(!robotsTxt.includes("Sitemap:"), `${host}/robots.txt advertises a sitemap`);
  }
});
check("API and health responses are noindex", async () => {
  const response = await serve(`${ORIGIN}/api/v1`);
  must(response.headers.get("X-Robots-Tag") === NOINDEX, `/api/v1 X-Robots-Tag ${response.headers.get("X-Robots-Tag")}`);
});
check("IndexNow key file served at /<key>.txt", async () => {
  const key = SEO_SITE.indexNowKey;
  must(/^[a-f0-9]{32}$/.test(key), "key must be 32 hex chars");
  const response = await serve(`${ORIGIN}/${key}.txt`);
  must(response.status === 200 && (response.headers.get("Content-Type") || "").startsWith("text/plain"), `key file -> ${response.status}`);
  must((await response.text()).trim() === key, "key file content mismatch");
});
check("IndexNow never submits private, preview or foreign URLs", () => {
  const candidates = [`${ORIGIN}/`, `${ORIGIN}/trips/abc`, `${ORIGIN}/join/token`, `${ORIGIN}/api/v1/trips`, "https://tripto-api.travelinkme.workers.dev/privacy", "https://www.tripto.to/privacy", "https://evil.example/", `${ORIGIN}/landing`, `${ORIGIN}/privacy`, `${ORIGIN}/privacy`];
  must(JSON.stringify(submittableUrls(candidates)) === JSON.stringify([`${ORIGIN}/`, `${ORIGIN}/privacy`]), `filter returned ${submittableUrls(candidates)}`);
  const body = indexNowRequestBody(manifest.pages.map((page) => page.url));
  must(body.host === "tripto.to" && body.keyLocation === `${ORIGIN}/${SEO_SITE.indexNowKey}.txt` && body.urlList.length === pages.length, "bad request body");
});
check("IndexNow flow: batch submit, retry with backoff, never throws", async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push(JSON.parse(init.body)); return new Response(null, { status: 202 }); };
  const down = async () => { throw new Error("network down"); };
  const db = fakeDb();
  const env = { ...baseEnv, DB: db, INDEXNOW_ENABLED: "true" };
  must((await runIndexNow({ ...env, INDEXNOW_ENABLED: "false" }, { fetcher: ok })).status === "disabled", "preview/disabled must not submit");
  let result = await runIndexNow(env, { fetcher: down, now: 1_000_000 });
  must(result.status === "failed", `first run with network down: ${result.status}`);
  result = await runIndexNow(env, { fetcher: ok, now: 1_000_000 + 60_000 });
  must(result.status === "backoff" && !calls.length, `retry inside backoff window: ${result.status}`);
  result = await runIndexNow(env, { fetcher: ok, now: 1_000_000 + 20 * 60_000 });
  must(result.status === "success" && calls.length === 1 && calls[0].urlList.length === pages.length, `retry after backoff: ${result.status}`);
  result = await runIndexNow(env, { fetcher: ok, now: 1_000_000 + 40 * 60_000 });
  must(result.status === "up-to-date" && calls.length === 1, "unchanged pages must not be resubmitted");
  const tried = [];
  const limited = async (url) => { tried.push(url); return new Response(null, { status: url.includes("api.indexnow.org") ? 429 : 202 }); };
  const fallback = await submitIndexNow([`${ORIGIN}/`], limited);
  must(fallback.ok && tried.length === 2, `429 must fall through to the next endpoint (tried ${tried.length})`);
  const rejected = await submitIndexNow([`${ORIGIN}/`], async () => new Response(null, { status: 403 }));
  must(!rejected.ok && rejected.httpStatus === 403, "403 must stop without success");
});
check("webmaster verification via env only, validated", async () => {
  must(siteVerificationMeta({}) === "", "no codes configured must emit nothing");
  must(!/google-site-verification|msvalidate|yandex-verification/.test(pages.map((page) => page.html).join("")), "hardcoded verification code in HTML");
  must(siteVerificationMeta({ GOOGLE_SITE_VERIFICATION: '"><script>' }) === "", "invalid code must be rejected");
  const env = { ...baseEnv, GOOGLE_SITE_VERIFICATION: "abcDEF123_-xyz", BING_SITE_VERIFICATION: "0123456789ABCDEF", YANDEX_VERIFICATION: "a1b2c3d4e5" };
  const home = await (await serve(`${ORIGIN}/`, {}, env)).text();
  must(home.includes('<meta name="google-site-verification" content="abcDEF123_-xyz">') && home.includes('name="msvalidate.01"') && home.includes('name="yandex-verification"'), "codes not injected on production home");
  const preview = await (await serve("https://tripto-api.travelinkme.workers.dev/", {}, env)).text();
  must(!preview.includes("google-site-verification"), "codes injected on a non-production host");
});
check("IndexNow enabled on production only", () => {
  const wrangler = readFileSync(join(root, "wrangler.jsonc"), "utf8");
  const previewBlock = wrangler.slice(wrangler.indexOf('"preview"'));
  must(/"INDEXNOW_ENABLED": "true"/.test(wrangler.slice(0, wrangler.indexOf('"env"'))), "production INDEXNOW_ENABLED must be true");
  must(/"INDEXNOW_ENABLED": "false"/.test(previewBlock), "preview INDEXNOW_ENABLED must be false");
});
check("no private data on public surfaces (llms.txt, ai-catalog)", () => {
  const surfaces = read("llms.txt") + read("ai-catalog.json");
  const urls = [...surfaces.matchAll(/https:\/\/tripto\.to(\/[^\s)"']*)/g)].map((m) => m[1]);
  const leaked = urls.filter((path) => SEO_SITE.appRoutes.includes(path.split("/")[1]));
  must(!leaked.length, `private routes listed: ${leaked.join(", ")}`);
});
check("CSP inline-script hashes + existing SEO release contract", () => {
  execFileSync(process.execPath, [join(root, "tests/seo-release.contract.mjs")], { stdio: "pipe" });
});

let failed = 0;
const results = [];
for (const { name, fn } of checks) {
  try { await fn(); results.push(["PASS", name, ""]); }
  catch (error) { failed += 1; results.push(["FAIL", name, error instanceof Error ? (error.stderr?.toString().trim().split("\n").pop() || error.message) : String(error)]); }
}
const width = Math.max(...results.map(([, name]) => name.length));
console.log(`\n  #  RESULT  ${"CHECK".padEnd(width)}  DETAIL`);
results.forEach(([status, name, detail], i) => console.log(`${String(i + 1).padStart(3)}  ${status.padEnd(6)}  ${name.padEnd(width)}  ${detail}`));
console.log(`\nSEO check: ${results.length - failed}/${results.length} passed${failed ? ` — ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);
