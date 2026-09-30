import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const app=readFileSync('public/mobile-app.js','utf8');
const runtime=readFileSync('public/i18n.js','utf8');
const min=readFileSync('public/mobile-app.min.js','utf8');
// Every render exit must translate and observe its freshly inserted tree. This
// covers the normal app, initial loading, Google recovery, and generic error.
const render=app.slice(app.indexOf('function render()'),app.indexOf('function focusKeyFor()'));
for(const state of ['state.loading','state.googleAuthHandoffStatus','state.error']) {
  const section=render.slice(render.indexOf(`if (${state})`),render.indexOf('return;',render.indexOf(`if (${state})`)));
  assert(section.includes('TriptoI18n?.translate(app)')&&section.includes('TriptoI18n?.observe(app)'),`${state} bypasses i18n post-render work`);
}
// A prior candidate emitted aria-label=i18nText("…") into the DOM. It showed
// the source expression to assistive technology instead of a translated label.
assert(!app.includes('aria-label=i18nText('),'Welcome ARIA label contains a JavaScript expression rather than a quoted value.');
assert(app.includes('aria-label="Your whole trip. Ready when you are."'),'Welcome heading needs a stable English source label for i18n.');
assert(!min.includes('aria-label=i18nText('),'Minified app retains a malformed welcome ARIA label.');
assert(runtime.includes('translateRoot(document)')&&runtime.includes('new MutationObserver'),'Runtime translation must cover initial and dynamic content.');
// Bottom sheets already expose their heading through aria-labelledby. A short
// static Close label avoids leaking an untranslated dynamic title into AT.
assert(app.includes('data-action="close-sheet" aria-label="Close"'),'Bottom-sheet close control must expose a static, translatable Close label.');
assert(runtime.includes('const nestedKey = keyFor(raw);'),'Dynamic patterns must resolve embedded static labels.');
console.log('i18n render lifecycle contract passed.');
