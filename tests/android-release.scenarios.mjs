// Android (Capacitor) packaging contract. Static checks on the native project,
// the bundled web client and the Worker pieces the app depends on (CORS for the
// app origin, Digital Asset Links, account-deletion page). No device needed.
// Run: node --import tsx/esm tests/android-release.scenarios.mjs (after npm run android:web)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { applyCors, corsPreflight, ensureApiCors } from '../apps/worker/src/http.ts';
import { frontendResponse } from '../apps/worker/src/index.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// Capacitor config: bundled assets only, never a remote server.url.
const cap = JSON.parse(read('capacitor.config.json'));
assert.equal(cap.appId, 'to.tripto.app');
assert.equal(cap.appName, 'tripto.to');
assert.equal(cap.webDir, 'android-web');
assert.equal(cap.server?.url, undefined, 'no server.url: the app ships its own web client');
assert.equal(cap.server?.cleartext, undefined);
assert.equal(cap.android?.webContentsDebuggingEnabled, false);

// Manifest: minimal permissions, no background location or broad storage access.
const manifest = read('android/app/src/main/AndroidManifest.xml');
const permissions = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map((m) => m[1]).sort();
assert.deepEqual(permissions, [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.INTERNET',
]);
const markup = manifest.replace(/<!--[\s\S]*?-->/g, '');
for (const forbidden of ['ACCESS_BACKGROUND_LOCATION', 'MANAGE_EXTERNAL_STORAGE', 'READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'READ_MEDIA_', 'CAMERA', 'usesCleartextTraffic="true"']) {
  assert.ok(!markup.includes(forbidden), `manifest must not contain ${forbidden}`);
}
assert.match(manifest, /android:allowBackup="false"/);
assert.match(manifest, /android:autoVerify="true"/);
assert.match(manifest, /android:pathPrefix="\/join\/"/);
assert.match(manifest, /android:exported="false"[\s\S]*?grantUriPermissions="true"/, 'FileProvider is private');
const filePaths = read('android/app/src/main/res/xml/file_paths.xml');
assert.deepEqual([...filePaths.matchAll(/<([a-z-]+-path) /g)].map((m) => m[1]), ['cache-path'], 'only the private share cache is exposed');

// Signing: secrets come from keystore.properties or env and are never committed.
const gradle = read('android/app/build.gradle');
assert.match(gradle, /keystore\.properties/);
assert.match(gradle, /TRIPTO_UPLOAD_STORE_PASSWORD/);
assert.ok(!/storePassword\s+['"][^'"]+['"]/.test(gradle), 'no hard-coded keystore password');
for (const ignore of [read('.gitignore'), read('android/.gitignore')]) {
  for (const pattern of ['*.jks', '*.keystore', 'keystore.properties']) assert.ok(ignore.split('\n').includes(pattern), `.gitignore lists ${pattern}`);
}
assert.match(read('android/version.properties'), /^versionCode=\d+$/m);

// Native bridge: tokens are never logged; sign-in uses Credential Manager.
const plugin = read('android/app/src/main/java/to/tripto/app/TriptoNativePlugin.java');
assert.ok(!/Log\.[dievw]\(|System\.out/.test(plugin), 'native plugin does not log');
assert.match(plugin, /GetSignInWithGoogleOption/);
assert.ok(!/WebView|loadUrl/.test(plugin.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')), 'no embedded web sign-in');

// Web client: every native path is behind the runtime NATIVE flag.
const app = read('public/mobile-app.js');
assert.match(app, /const NATIVE = Boolean\(globalThis\.Capacitor\?\.isNativePlatform\?\.\(\)\);/);
assert.match(app, /const API = NATIVE \? "https:\/\/tripto\.to" : "";/);
assert.match(app, /const checkout = NATIVE \? null : subscriptionCheckoutUrl\(plan\);/, 'no web checkout inside the Android app');
assert.match(app, /case "manage-subscription": \{\n\s+if \(NATIVE\) break;/);
assert.match(app, /!PREVIEW_MODE && !NATIVE\)\n\s+window\.addEventListener\("load"/, 'no service worker in the app');
assert.ok(!/fetch\(`\/api\//.test(app), 'API calls use the API base');

// Bundled client (npm run android:web).
if (existsSync(new URL('../android-web/index.html', import.meta.url))) {
  const html = read('android-web/index.html');
  assert.ok(!/serviceWorker\.register|googletagmanager|gtag\(|consent-banner|shell-update\.js/.test(html));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
  assert.match(csp, /connect-src [^;]*https:\/\/tripto\.to/);
  assert.match(csp, /frame-src 'none'|frame-src [^;]*/);
  assert.ok(!csp.includes('googletagmanager'));
  assert.ok(existsSync(new URL('../android-web/mobile-app.min.js', import.meta.url)));
  assert.ok(!existsSync(new URL('../android-web/sw.js', import.meta.url)));
  assert.ok(!existsSync(new URL('../android-web/mobile-app.js', import.meta.url)));
} else {
  console.warn('android contract: android-web/ not built; skipped bundle checks (run npm run android:web).');
}

// CORS: the app origin is allowlisted; other origins are not; no credentials.
const env = { ALLOWED_ORIGINS: 'https://localhost', ANDROID_APP_PACKAGE: 'to.tripto.app', ANDROID_APP_LINK_SHA256: '' };
const req = (origin, path = '/api/v1/trips') => new Request(`https://tripto.to${path}`, { headers: origin ? { origin } : {} });
let headers = new Headers();
applyCors(headers, req('https://localhost'), env);
assert.equal(headers.get('access-control-allow-origin'), 'https://localhost');
assert.equal(headers.get('access-control-allow-credentials'), null);
headers = new Headers();
applyCors(headers, req('https://evil.example'), env);
assert.equal(headers.get('access-control-allow-origin'), null);
const preflight = corsPreflight(new Request('https://tripto.to/api/v1/trips', { method: 'OPTIONS', headers: { origin: 'https://localhost' } }), env);
assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://localhost');
assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/);
const bare = new Response('{}', { status: 200 });
assert.equal(ensureApiCors(bare, req('https://localhost'), env).headers.get('access-control-allow-origin'), 'https://localhost');
assert.equal(ensureApiCors(bare, req('https://evil.example'), env), bare);
assert.equal(ensureApiCors(bare, req('https://localhost', '/privacy'), env), bare);
const wrangler = read('wrangler.jsonc');
assert.ok(!/"ALLOWED_ORIGINS":\s*"[^"]*\*/.test(wrangler), 'no wildcard origins');

// Digital Asset Links: 404 until the owner sets the signing fingerprint.
const assets = { ASSETS: { fetch: async (r) => new Response(`<html>${new URL(r.url).pathname}</html>`, { headers: { 'Content-Type': 'text/html' } }) } };
let res = await frontendResponse(new Request('https://tripto.to/.well-known/assetlinks.json'), { ...env, ...assets }, '/.well-known/assetlinks.json');
assert.equal(res.status, 404);
const fp = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
res = await frontendResponse(new Request('https://tripto.to/.well-known/assetlinks.json'), { ...env, ...assets, ANDROID_APP_LINK_SHA256: `${fp.toLowerCase()}, not-a-fingerprint` }, '/.well-known/assetlinks.json');
assert.equal(res.status, 200);
const links = await res.json();
assert.deepEqual(links[0].target, { namespace: 'android_app', package_name: 'to.tripto.app', sha256_cert_fingerprints: [fp] });

// Account deletion web page (Play requirement) is public and linked.
res = await frontendResponse(new Request('https://tripto.to/delete-account'), { ...env, ...assets }, '/delete-account');
assert.equal(await res.text(), '<html>/delete-account.html</html>');
assert.ok(res.headers.get('content-security-policy'));
const deletePage = read('public/delete-account.html');
assert.match(deletePage, /<link rel="canonical" href="https:\/\/tripto\.to\/delete-account">/);
assert.match(deletePage, /Delete my account/);
assert.match(deletePage, /mailto:go@tripto\.to/);
assert.match(read('public/privacy.html'), /href="\/delete-account"/);
assert.match(read('public/sitemap.xml'), /https:\/\/tripto\.to\/delete-account/);

console.log('Android contract passed: bundled client, minimal permissions, private file sharing, signing hygiene, app-origin CORS, asset links, account deletion page.');
