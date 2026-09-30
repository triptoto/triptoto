import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

// Every page with a header carries a "?" that opens its About-this-page guide.
const src = readFileSync('public/mobile-app.js', 'utf8');
const start = src.indexOf('const PAGE_HELP = ');
assert(start > 0, 'PAGE_HELP table missing');
const body = src.slice(start + 18, src.indexOf('const PAGE_HELP_HEADINGS', start)).trim().replace(/;$/, '');
const PAGE_HELP = Function(`return (${body})`)();

const renderCases = [...src.slice(src.indexOf('case "home"'), src.indexOf('case "join"') + 12).matchAll(/case "([a-z-]+)"/g)].map((m) => m[1]);
const noHeader = new Set(['home', 'help', 'form', 'bookings']);
for (const screen of renderCases) if (!noHeader.has(screen)) assert(PAGE_HELP[screen], `page help missing for screen "${screen}"`);
for (const key of ['form-trip', 'form-trip-edit', 'form-traveler', 'form-checklist', 'form-document', 'form-flight', 'form-hotel', 'form-booking', 'trip-review']) assert(PAGE_HELP[key], `page help missing for ${key}`);

for (const [key, guide] of Object.entries(PAGE_HELP)) {
  assert(guide.title && guide.intro, `${key}: title and intro required`);
  assert(guide.how?.length, `${key}: "How to use it" steps required`);
}

assert.match(src, /const help = pageHelpButton\(\);/, 'appBar must render the help button');
assert.match(src, /pageHelpButton\("trips"\)/, 'trips header needs help');
assert.match(src, /pageHelpButton\("timeline"\)/, 'timeline header needs help');
assert.match(src, /pageHelpButton\("trip-map"/, 'map top bar needs help');
assert.match(src, /pageHelpButton\("trip-review"\)/, 'trip review header needs help');
assert.match(src, /case "open-page-help":/, 'open-page-help action missing');
assert.match(src, /state\.sheet === "page-help"\) html \+= pageHelpSheet\(\)/, 'page-help sheet not wired');
console.log(`page help: ${Object.keys(PAGE_HELP).length} guides, ${renderCases.length} screens checked`);
