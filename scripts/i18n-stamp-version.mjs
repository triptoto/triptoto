#!/usr/bin/env node
// Stamp the current deploy token into every locale bundle so the runtime can
// detect when a stale service worker is serving last-deploy's cached bytes
// (it ignores our ?v= query) and self-heal. The token is the single source of
// truth in public/index.html (the <meta name="tripto-asset-ver"> tag); we copy
// it into each bundle's top-level `version`. Runs as part of build:app-shell,
// after the deploy token has been bumped, so bundles and index.html always agree.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const indexHtml = readFileSync(join(root, "public/index.html"), "utf8");
const match = indexHtml.match(/<meta\s+name="tripto-asset-ver"\s+content="([^"]+)"/);
if (!match) {
  console.error("i18n-stamp-version: <meta name=\"tripto-asset-ver\"> not found in public/index.html");
  process.exit(1);
}
const version = match[1];

const locales = ["en", "de", "fr", "es", "ru"];
for (const code of locales) {
  const path = join(root, `public/lang/${code}.json`);
  const bundle = JSON.parse(readFileSync(path, "utf8"));
  // version LAST so it always wins, even when the bundle already carries a
  // stale `version` from a previous stamped deploy (spread order matters).
  const stamped = { ...bundle, version };
  writeFileSync(path, JSON.stringify(stamped, null, 2) + "\n");
}
console.log(`i18n-stamp-version: stamped ${version} into ${locales.length} locale bundles.`);
