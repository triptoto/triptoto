#!/usr/bin/env node
// IndexNow helper. The production worker submits changed public URLs by itself
// (first request after a deploy, cron as fallback); this script reports on that
// and offers a manual retry. It always exits 0 so it can never fail a deploy.
//   npm run seo:indexnow                 print the worker's IndexNow status
//   npm run seo:indexnow -- --wait       after a deploy: wait for the submission
//   npm run seo:indexnow -- --submit     resubmit every public URL from here
import { execFileSync } from "node:child_process";
import manifest from "../seo/manifest.json" with { type: "json" };
import { SEO_SITE, indexNowRequestBody, submitIndexNow } from "../apps/worker/src/seo.ts";

const args = new Set(process.argv.slice(2));
const STATUS_URLS = [`${SEO_SITE.origin}/api/v1/seo/indexnow`, "https://tripto-api.travelinkme.workers.dev/api/v1/seo/indexnow"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const RETRY = "retry available: npm run seo:indexnow -- --submit";

async function status() {
  for (const url of STATUS_URLS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) return await response.json();
    } catch {}
    // Node's fetch ignores HTTPS_PROXY; curl honours it.
    try { return JSON.parse(execFileSync("curl", ["-sf", "-m", "10", url], { encoding: "utf8" })); } catch {}
  }
  return null;
}

async function submitFromHere() {
  const urls = manifest.pages.map((page) => page.url);
  console.log(`Submitting ${indexNowRequestBody(urls).urlList.length} public URL(s) to ${SEO_SITE.indexNowEndpoints.join(", ")}`);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await submitIndexNow(urls);
    if (result.ok) return console.log(`IndexNow: SUCCESS (HTTP ${result.httpStatus} from ${result.endpoint})`);
    const retryable = result.httpStatus === 0 || result.httpStatus === 429 || result.httpStatus >= 500;
    console.log(`  attempt ${attempt}: HTTP ${result.httpStatus || "network error"}`);
    if (!retryable) break;
    if (attempt < 3) await sleep(2000 * attempt);
  }
  console.log(`IndexNow: FAILED — ${RETRY}`);
}

async function report(wait) {
  const deadline = Date.now() + (wait ? 90000 : 0);
  let current = await status();
  while (wait && current && current.enabled && current.pending.length && !current.lastFailureAt && Date.now() < deadline) {
    await sleep(5000);
    current = await status();
  }
  if (!current) return console.log(`IndexNow: UNKNOWN (status endpoint unreachable from this machine) — ${RETRY}`);
  if (!current.enabled) return console.log("IndexNow: DISABLED (INDEXNOW_ENABLED is not true on this worker)");
  if (!current.pending.length) {
    const when = current.lastSuccessAt ? new Date(current.lastSuccessAt).toISOString() : "earlier";
    return console.log(`IndexNow: SUCCESS (all ${manifest.pages.length} public URLs submitted; last submission ${when}, HTTP ${current.lastHttpStatus ?? "-"})`);
  }
  if (current.lastFailureAt) return console.log(`IndexNow: FAILED (HTTP ${current.lastHttpStatus || "network"}, ${current.consecutiveFailures} attempt(s); the worker retries automatically) — ${RETRY}`);
  console.log(`IndexNow: PENDING (${current.pending.length} URL(s); the worker submits on its next check or cron)`);
}

try {
  if (args.has("--submit")) await submitFromHere();
  else await report(args.has("--wait"));
} catch (error) {
  console.log(`IndexNow: FAILED (${error instanceof Error ? error.message : "unknown error"}) — ${RETRY}`);
}
