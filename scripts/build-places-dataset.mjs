import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { unzipSync, strFromU8 } from 'fflate';

const VERSION = process.env.PLACES_DATA_VERSION || '2026-08-26';
const OUTPUT = resolve(`public/data/places-${VERSION}.json`);
const SOURCES = {
  cities: 'https://download.geonames.org/export/dump/cities15000.zip',
  countries: 'https://davidmegginson.github.io/ourairports-data/countries.csv',
  regions: 'https://davidmegginson.github.io/ourairports-data/regions.csv',
  airports: 'https://davidmegginson.github.io/ourairports-data/airports.csv',
  airportTimezones: 'https://raw.githubusercontent.com/mwgg/Airports/master/airports.json',
};

function normalizeText(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

function searchText(value) {
  return normalizeText(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function csv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value); value = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = rows.shift();
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

async function text(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'tripto.to-offline-places-builder/1' } });
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  return response.text();
}

async function json(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'tripto.to-offline-places-builder/1' } });
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  return response.json();
}

async function zipText(url, filename) {
  const response = await fetch(url, { headers: { 'user-agent': 'tripto.to-offline-places-builder/1' } });
  if (!response.ok) throw new Error(`${url} failed: HTTP ${response.status}`);
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const entry = archive[filename] || Object.values(archive)[0];
  if (!entry) throw new Error(`${filename} is missing from ${url}`);
  return strFromU8(entry);
}

function aliases(values, primary) {
  const seen = new Set([searchText(primary)]), output = [];
  for (const raw of values) {
    const value = normalizeText(raw);
    const normalized = searchText(value);
    if (!normalized || seen.has(normalized) || value.length < 2 || value.length > 80 || /^https?:/i.test(value)) continue;
    seen.add(normalized);
    output.push(value);
    if (output.length >= 8) break;
  }
  return output;
}

function validTimezone(timezone) {
  if (!timezone) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(0); return true; }
  catch { return false; }
}

function numberOrNull(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

const [cityDump, countryRows, regionRows, airportRows, airportTimezoneRows] = await Promise.all([
  zipText(SOURCES.cities, 'cities15000.txt'),
  text(SOURCES.countries).then(csv),
  text(SOURCES.regions).then(csv),
  text(SOURCES.airports).then(csv),
  json(SOURCES.airportTimezones),
]);
const countries = new Map(countryRows.map((row) => [row.code, normalizeText(row.name)]));
const regions = new Map(regionRows.map((row) => [row.code, normalizeText(row.name)]));

const cities = cityDump.split(/\r?\n/).filter(Boolean).map((line) => {
  const row = line.split('\t');
  const [geonameId, name, asciiName, alternateNames, latitude, longitude, , , countryCode, , admin1, , , , population, , , timezone] = row;
  const countryName = countries.get(countryCode) || countryCode;
  const region = regions.get(`${countryCode}-${admin1}`) || null;
  const shortCityName = normalizeText(name).replace(/\s+City$/i, '');
  const cityAliases = aliases([asciiName, shortCityName, ...String(alternateNames || '').split(',')], name);
  return {
    id: `city:geonames:${geonameId}`, type: 'city', name: normalizeText(name),
    localName: normalizeText(name) !== normalizeText(asciiName) ? normalizeText(name) : null,
    aliases: cityAliases, countryName, countryCode, region,
    latitude: numberOrNull(latitude), longitude: numberOrNull(longitude),
    timezone: validTimezone(timezone) ? timezone : null, population: Number(population) || 0,
  };
});

const duplicateCityNames = new Map();
for (const city of cities) {
  const key = `${searchText(city.name)}|${city.countryCode}`;
  duplicateCityNames.set(key, (duplicateCityNames.get(key) || 0) + 1);
}

const airportTimezonesByIata = new Map();
for (const row of Object.values(airportTimezoneRows)) {
  if (row.iata && validTimezone(row.tz)) airportTimezonesByIata.set(row.iata, row.tz);
}

const airports = airportRows.filter((row) =>
  row.scheduled_service === 'yes' && /^[A-Z]{3}$/.test(row.iata_code) &&
  ['large_airport', 'medium_airport', 'small_airport'].includes(row.type),
).map((row) => {
  const latitude = numberOrNull(row.latitude_deg), longitude = numberOrNull(row.longitude_deg);
  const timezoneSource = airportTimezoneRows[row.gps_code] || null;
  const timezoneCandidate = timezoneSource?.iata === row.iata_code
    ? timezoneSource.tz : airportTimezonesByIata.get(row.iata_code);
  const timezone = validTimezone(timezoneCandidate) ? timezoneCandidate : null;
  const countryName = countries.get(row.iso_country) || row.iso_country;
  const resolvedRegion = regions.get(row.iso_region) || null;
  const region = resolvedRegion && resolvedRegion !== '(unassigned)' ? resolvedRegion : null;
  const airportAliases = aliases([timezoneSource?.city, ...(row.keywords || '').split(','), row.municipality], row.name);
  return {
    id: `airport:iata:${row.iata_code}`, type: 'airport', name: normalizeText(row.name),
    aliases: airportAliases, countryName, countryCode: row.iso_country,
    region, cityName: normalizeText(timezoneSource?.city || row.municipality) || null,
    iata: row.iata_code, icao: /^[A-Z0-9]{4}$/.test(row.gps_code) ? row.gps_code : null,
    latitude, longitude, timezone, population: 0,
  };
});

const places = [...cities, ...airports].sort((left, right) => left.id.localeCompare(right.id)).map((place) => {
  const disambiguate = place.type === 'city' && duplicateCityNames.get(`${searchText(place.name)}|${place.countryCode}`) > 1;
  const displayName = place.type === 'city'
    ? [place.name, disambiguate ? place.region : null, place.countryName].filter(Boolean).join(', ')
    : `${place.name}${place.iata ? ` (${place.iata})` : ''}`;
  const combinedSearch = searchText([
    place.name, displayName, place.cityName, place.countryName, place.region,
    place.iata, place.icao, ...(place.aliases || []),
  ].filter(Boolean).join(' '));
  return [place.id, place.type, place.name, displayName, place.localName || null,
    place.aliases || [], place.countryName || null, place.countryCode || null,
    place.region || null, place.cityName || null, place.iata || null,
    place.icao || null, place.latitude ?? null, place.longitude ?? null,
    place.timezone || null, place.population || 0, combinedSearch];
});

const output = JSON.stringify({ version: VERSION, cities: cities.length, airports: airports.length, places });
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${output}\n`);
const gzipBytes = gzipSync(output, { level: 9 }).length;
console.log(JSON.stringify({ output: OUTPUT, version: VERSION, cities: cities.length, airports: airports.length, bytes: Buffer.byteLength(output), gzipBytes }, null, 2));
