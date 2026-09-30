import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = resolve(process.argv[2] || 'scripts/data/tripto_to_tax_refund_249_v1.json');
const output = resolve(process.argv[3] || 'migrations/0034_tax_refund_country_guides.sql');
const rows = JSON.parse(readFileSync(source, 'utf8'));

if (!Array.isArray(rows) || rows.length !== 249) throw new Error('Expected exactly 249 country records.');
const iso2 = new Set(rows.map((row) => row.iso2));
if (iso2.size !== 249 || [...iso2].some((code) => !/^[A-Z]{2}$/.test(code))) throw new Error('ISO-2 codes must be unique and valid.');

const fields = [
  'iso2','iso3','destination','refund_status','tax_type','standard_tax_rate','minimum_purchase',
  'eligibility','eligible_purchases','excluded_purchases','export_deadline','at_purchase',
  'departure_process','refund_method_fees','future_change','traveler_summary','source_quality',
  'source_url_primary','source_url_secondary','last_verified_at','confidence','manual_review_required',
  'app_display_policy','status_label','data_version','stale_after_days','refresh_before_trip',
];
const q = (value) => value == null || value === '' ? 'NULL' : typeof value === 'number' ? String(value) : `'${String(value).replaceAll("'", "''")}'`;
const sql = [
  '-- Generated from tripto_to_tax_refund_249_v1.json. Do not hand-edit country rows.',
  'CREATE TABLE IF NOT EXISTS tax_refund_country_guides (',
  '  iso2 TEXT PRIMARY KEY, iso3 TEXT NOT NULL, destination TEXT NOT NULL, refund_status TEXT NOT NULL,',
  '  tax_type TEXT, standard_tax_rate TEXT, minimum_purchase TEXT, eligibility TEXT NOT NULL,',
  '  eligible_purchases TEXT, excluded_purchases TEXT, export_deadline TEXT, at_purchase TEXT NOT NULL,',
  '  departure_process TEXT NOT NULL, refund_method_fees TEXT, future_change TEXT, traveler_summary TEXT NOT NULL,',
  '  source_quality TEXT NOT NULL, source_url_primary TEXT NOT NULL, source_url_secondary TEXT,',
  '  last_verified_at TEXT NOT NULL, confidence TEXT NOT NULL, manual_review_required TEXT NOT NULL,',
  '  app_display_policy TEXT NOT NULL, status_label TEXT NOT NULL, data_version TEXT NOT NULL,',
  '  stale_after_days INTEGER NOT NULL, refresh_before_trip TEXT NOT NULL',
  ');',
  'CREATE INDEX IF NOT EXISTS idx_tax_refund_country_guides_status ON tax_refund_country_guides(refund_status,confidence);',
  ...rows.map((row) => `INSERT OR REPLACE INTO tax_refund_country_guides (${fields.join(',')}) VALUES (${fields.map((field) => q(row[field])).join(',')});`),
  '',
].join('\n');
writeFileSync(output, sql);
console.log(`Wrote ${rows.length} records to ${output}`);
