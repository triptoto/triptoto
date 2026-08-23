import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
const OUTPUT = resolve("packages/airport-timezones/data/iata-timezones.json");

function parseCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else value += character;
  }
  values.push(value);
  return values;
}

function isIanaTimezone(value) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

const response = await fetch(SOURCE_URL, {
  headers: { "user-agent": "tripto.to-airport-timezone-generator" },
});
if (!response.ok)
  throw new Error(`Airport data download failed: HTTP ${response.status}`);

const candidates = new Map();
for (const line of (await response.text()).split(/\r?\n/)) {
  if (!line) continue;
  const row = parseCsvLine(line);
  const code = String(row[4] || "").trim().toUpperCase();
  const timezone = String(row[11] || "").trim();
  const type = String(row[12] || "").trim().toLowerCase();
  if (type !== "airport" || !/^[A-Z]{3}$/.test(code) || !isIanaTimezone(timezone))
    continue;
  if (!candidates.has(code)) candidates.set(code, new Set());
  candidates.get(code).add(timezone);
}

const timezones = Object.fromEntries(
  [...candidates.entries()]
    .filter(([, values]) => values.size === 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, values]) => [code, [...values][0]]),
);

if (Object.keys(timezones).length < 3_000)
  throw new Error("Airport timezone catalog is unexpectedly small.");
if (timezones.TLV !== "Asia/Jerusalem" || timezones.FCO !== "Europe/Rome")
  throw new Error("Required TLV/FCO airport timezone mappings are missing.");

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(timezones, null, 2)}\n`);
console.log(`Wrote ${Object.keys(timezones).length} unambiguous airport timezones to ${OUTPUT}`);
