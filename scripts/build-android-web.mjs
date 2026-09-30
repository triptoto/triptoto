#!/usr/bin/env node
// Builds the bundled web client for the Capacitor Android app (webDir: android-web/).
//
// The web app in public/ is served by the Cloudflare Worker and stays unchanged.
// The Android build packages the same files locally (no dev server, no server.url)
// and talks to the existing backend at https://tripto.to over CORS + Bearer
// sessions. This script only copies and applies packaging-level edits to
// index.html; app behaviour differences live behind the runtime
// `Capacitor.isNativePlatform()` check in mobile-app.js.
//
// Run `npm run build:app-shell` first (npm run android:web does both).
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'public');
const out = join(root, 'android-web');
const API_ORIGIN = 'https://tripto.to';

// Web-only files: SEO/crawler files, the service worker (assets are already
// local in the APK) and the marketing landing page. Legal pages are opened on
// https://tripto.to in the system browser, so they are not bundled either.
const EXCLUDE = new Set([
  'sw.js', '_headers', 'robots.txt', 'sitemap.xml', 'llms.txt', 'ai-catalog.json',
  'landing.html', 'landing-assets', '404.html', 'consent-banner.js',
  'privacy.html', 'terms.html', 'cookies.html', 'contact.html', 'delete-account.html', 'legal-page.css',
  'shell-update.js', 'canonical-host.js',
  'mobile-app.js', 'mobile-app.css',
]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, {
  recursive: true,
  filter: (file) => {
    const rel = relative(src, file);
    if (!rel) return true;
    const top = rel.split(/[\\/]/)[0];
    return !EXCLUDE.has(top) && !rel.endsWith('.DS_Store');
  },
});

let html = readFileSync(join(src, 'index.html'), 'utf8');
const removeExact = (needle, label) => {
  if (!html.includes(needle)) throw new Error(`android-web: expected ${label} in public/index.html`);
  html = html.replace(needle, '');
};
const removeScriptContaining = (marker, label) => {
  const re = /<script>[\s\S]*?<\/script>\s*/g;
  let removed = 0;
  html = html.replace(re, (block) => (block.includes(marker) ? (removed++, '') : block));
  if (!removed) throw new Error(`android-web: expected ${label} in public/index.html`);
};

// 1. No service worker in the native shell: files are already on the device.
removeScriptContaining('navigator.serviceWorker.register', 'service worker registration');
// Service-worker update helper and the www->apex redirect are web-only.
html = html.replace(/\s*<script src="\/shell-update\.js[^"]*"><\/script>/, '');
html = html.replace(/\s*<script src="\/canonical-host\.js[^"]*"><\/script>/, '');
// 2. No Google Analytics / consent banner in the Android app (not needed for
//    any user feature; keeps the Data safety declaration minimal).
html = html.replace(/\s*<!-- Google tag \(gtag\.js\) -->\s*/, '\n  ');
removeExact('<script async src="https://www.googletagmanager.com/gtag/js?id=G-Y7EBJRZVVW"></script>', 'gtag loader');
removeScriptContaining("gtag('config'", 'gtag config');
html = html.replace(/\s*<script src="\/consent-banner\.js[^"]*" defer><\/script>/, '');
// 3. The file:// redirect is meaningless inside the app.
removeScriptContaining('location.protocol!=="file:"', 'file: redirect');
// 4. Web-only discovery tags.
html = html.replace(/\s*<link rel="manifest"[^>]*>/, '');
html = html.replace(/\s*<link rel="canonical"[^>]*>/, '');
html = html.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
html = html.replace('<meta name="robots" content="index, follow">', '<meta name="robots" content="noindex">');
html = html.replace('<a href="/landing">', `<a href="${API_ORIGIN}/landing">`);

// 5. Content-Security-Policy as a <meta> (the Worker sends it as a header on
//    the web). Derived from the Worker's policy so both stay in sync.
const worker = readFileSync(join(root, 'apps/worker/src/index.ts'), 'utf8');
const block = worker.match(/const CONTENT_SECURITY_POLICY = \[([\s\S]*?)\]\.join/);
if (!block) throw new Error('android-web: CONTENT_SECURITY_POLICY not found in the Worker');
const directives = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const inlineHashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
const csp = directives
  .filter((d) => !d.startsWith('frame-ancestors') && !d.startsWith('manifest-src'))
  .map((d) => {
    if (d.startsWith('script-src ')) {
      const hosts = d.split(' ').slice(1).filter((t) => !t.startsWith("'sha256-") && t !== 'https://www.googletagmanager.com');
      return ['script-src', ...hosts.slice(0, 1), ...inlineHashes, ...hosts.slice(1)].join(' ');
    }
    // blob: lets a download link's temporary file be read and handed to the
    // system "Save to" picker.
    if (d.startsWith('connect-src ')) return `${d} ${API_ORIGIN} blob:`;
    return d;
  })
  .join('; ');
html = html.replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <meta http-equiv="Content-Security-Policy" content="${csp}">`);

if (/serviceWorker\.register|googletagmanager|server\.url|shell-update\.js|canonical-host\.js/.test(html)) throw new Error('android-web: web-only code left in index.html');
writeFileSync(join(out, 'index.html'), html);

// Every local asset referenced by index.html must be bundled.
const missing = [...html.matchAll(/(?:src|href)="(\/[^"?#]*)/g)]
  .map((m) => m[1])
  .filter((p) => p !== '/' && !existsSync(join(out, p)));
if (missing.length) throw new Error(`android-web: missing bundled assets: ${missing.join(', ')}`);

console.log(`android-web: bundled ${relative(root, out)}/ (API ${API_ORIGIN}, ${inlineHashes.length} inline script hashes)`);
