-- Versioned, reviewable Tax Free / tourist VAT refund knowledge base.
-- Published rules are immutable. Detected source changes create review candidates
-- and never change traveler-facing content automatically.

CREATE TABLE IF NOT EXISTS tax_free_territories (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  region_code TEXT,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES tax_free_territories(id),
  status TEXT NOT NULL CHECK (status IN ('verified_available','verified_unavailable','partial','unverified','recheck')),
  regional_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(country_code, region_code)
);

CREATE TABLE IF NOT EXISTS tax_free_rule_versions (
  id TEXT PRIMARY KEY,
  territory_id TEXT NOT NULL REFERENCES tax_free_territories(id),
  version_number INTEGER NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('draft','published','retired')),
  availability TEXT NOT NULL CHECK (availability IN ('available','unavailable','partial','unverified','recheck')),
  program_name TEXT NOT NULL,
  summary TEXT NOT NULL,
  eligibility_json TEXT NOT NULL CHECK (json_valid(eligibility_json)),
  purchases_json TEXT NOT NULL CHECK (json_valid(purchases_json)),
  store_steps_json TEXT NOT NULL CHECK (json_valid(store_steps_json)),
  documents_json TEXT NOT NULL CHECK (json_valid(documents_json)),
  goods_json TEXT NOT NULL CHECK (json_valid(goods_json)),
  deadlines_json TEXT NOT NULL CHECK (json_valid(deadlines_json)),
  customs_json TEXT NOT NULL CHECK (json_valid(customs_json)),
  electronic_validation_json TEXT NOT NULL CHECK (json_valid(electronic_validation_json)),
  payout_json TEXT NOT NULL CHECK (json_valid(payout_json)),
  disclaimer TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  content_verified_at INTEGER NOT NULL,
  source_checked_at INTEGER NOT NULL,
  published_at INTEGER,
  published_by TEXT,
  supersedes_version_id TEXT REFERENCES tax_free_rule_versions(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(territory_id, version_number)
);

CREATE TABLE IF NOT EXISTS tax_free_rates (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  rate REAL NOT NULL CHECK (rate > 0 AND rate < 100),
  price_includes_tax INTEGER NOT NULL DEFAULT 1 CHECK (price_includes_tax IN (0,1)),
  notes TEXT,
  UNIQUE(rule_version_id, category, rate)
);

CREATE TABLE IF NOT EXISTS tax_free_thresholds (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  maximum_amount REAL,
  currency TEXT NOT NULL,
  basis TEXT NOT NULL CHECK (basis IN ('receipt','invoice','store_day','item','other')),
  comparison TEXT NOT NULL CHECK (comparison IN ('gt','gte','lte','range')),
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tax_free_operators (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  methods_json TEXT NOT NULL CHECK (json_valid(methods_json)),
  fee_json TEXT CHECK (fee_json IS NULL OR json_valid(fee_json)),
  timing TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS tax_free_exit_instructions (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  exit_type TEXT NOT NULL CHECK (exit_type IN ('country','eu_final_exit','region','airport','port','other')),
  location_name TEXT,
  title TEXT NOT NULL,
  instructions_json TEXT NOT NULL CHECK (json_valid(instructions_json)),
  baggage_note TEXT
);

CREATE TABLE IF NOT EXISTS tax_free_sources (
  id TEXT PRIMARY KEY,
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  publisher TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('tax_authority','customs','airport','operator','law')),
  claim_scope TEXT NOT NULL,
  effective_from TEXT,
  checked_at INTEGER NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  last_technical_check_at INTEGER,
  next_check_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE(rule_version_id, url)
);

CREATE TABLE IF NOT EXISTS tax_free_rule_translations (
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  source_translation_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(rule_version_id, locale, field_key)
);

CREATE TABLE IF NOT EXISTS tax_free_change_candidates (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES tax_free_sources(id),
  detected_at INTEGER NOT NULL,
  before_hash TEXT,
  after_hash TEXT,
  http_status INTEGER,
  diff_summary TEXT,
  candidate_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed','error')),
  reviewed_at INTEGER,
  reviewed_by TEXT,
  review_note TEXT
);

CREATE TABLE IF NOT EXISTS tax_free_recheck_queue (
  source_id TEXT PRIMARY KEY REFERENCES tax_free_sources(id),
  reason TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 50,
  due_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  paused_until INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_free_publication_history (
  id TEXT PRIMARY KEY,
  territory_id TEXT NOT NULL REFERENCES tax_free_territories(id),
  rule_version_id TEXT NOT NULL REFERENCES tax_free_rule_versions(id),
  action TEXT NOT NULL CHECK (action IN ('publish','rollback')),
  actor TEXT NOT NULL,
  notes TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tax_free_territory_lookup ON tax_free_territories(country_code, region_code, status);
CREATE INDEX IF NOT EXISTS idx_tax_free_rules_effective ON tax_free_rule_versions(territory_id, lifecycle, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_tax_free_sources_due ON tax_free_sources(active, next_check_at);
CREATE INDEX IF NOT EXISTS idx_tax_free_candidates_status ON tax_free_change_candidates(status, detected_at);

-- Seed data was reviewed against official government/customs publications on
-- 2026-09-27. The UI exposes source, content-verification, technical-check and
-- device-load timestamps separately.
INSERT OR IGNORE INTO tax_free_territories VALUES
('tf-fr','FR',NULL,'France',NULL,'verified_available',NULL,1770000000000,1790467200000),
('tf-it','IT',NULL,'Italy',NULL,'verified_available',NULL,1770000000000,1790467200000),
('tf-jp','JP',NULL,'Japan',NULL,'verified_available','A refund-method reform takes effect on 1 November 2026.',1770000000000,1790467200000),
('tf-gb','GB',NULL,'United Kingdom',NULL,'verified_unavailable','Great Britain and Northern Ireland have different rules.',1770000000000,1790467200000),
('tf-gb-nir','GB','GB-NIR','Northern Ireland','tf-gb','verified_available','Available under the Northern Ireland VAT Retail Export Scheme.',1770000000000,1790467200000);

INSERT OR IGNORE INTO tax_free_rule_versions VALUES
('tf-fr-v1','tf-fr',1,'published','available','PABLO VAT refund','Eligible non-EU residents can request tax-free shopping from participating French retailers and validate export at the final EU exit.',
'["Habitual residence outside the European Union","Visiting France for less than six months","At least 16 years old"]',
'["Tourist retail goods for personal, non-commercial export","Controlled goods, tobacco, petroleum products, weapons, cultural goods and private vehicles can be excluded or restricted"]',
'["Check that the shop offers tax-free sales","Show identity and proof of residence","Ask for the electronic PABLO export form and verify its barcode and refund details"]',
'["Passport or accepted proof of non-EU residence","PABLO export sales form","Receipts"]',
'["Keep goods available for customs inspection","Present goods and the form before checking baggage"]',
'{"export":"By the end of the third month after purchase","sellerReceipt":"A manually endorsed form must reach the seller within six months"}',
'["Validate at the final EU exit","When leaving through France, scan the PABLO barcode near customs","When leaving through another EU country, use that country’s customs procedure"]',
'["A green PABLO result confirms customs validation","PABLO validates export; it does not pay the refund"]',
'["The retailer or named operator pays according to the sales form","French customs does not pay the refund","Operator fees and payout timing depend on the retailer or operator"]',
'Rules can change and eligibility depends on your circumstances. Confirm the current procedure with the retailer and customs before travel.','2024-01-01',NULL,1790467200000,1790467200000,1790467200000,'seed-review',NULL,1790467200000,1790467200000),
('tf-it-v1','tf-it',1,'published','available','OTELLO tax-free shopping','Non-EU residents can obtain VAT relief or a later refund for qualifying goods bought in Italy and exported through the required customs process.',
'["Resident or domiciled outside the European Union","Goods for personal or family use"]',
'["Goods carried in personal luggage","Services such as hotels, restaurants, taxis and agencies are not eligible"]',
'["Choose a retailer that issues an electronic tax-free invoice","Present a passport or equivalent identity document","Check the OTELLO request code and all invoice details before leaving the shop"]',
'["Passport or equivalent document","Electronic tax-free invoice with OTELLO request code","Goods"]',
'["Keep purchased goods available for customs inspection","Carry goods in personal luggage"]',
'{"export":"Goods must leave the EU by the end of the third month after the invoice date"}',
'["Obtain the customs visa at the final EU exit","At Italian exit points, tax-free invoice validation is digital through OTELLO"]',
'["OTELLO records the customs visa digitally","Electronic validation proves export; it is separate from payment"]',
'["Relief may be direct from the seller or paid later","A tax-free company may deduct a service fee","The invoice identifies the applicable route or operator"]',
'Rules can change and eligibility depends on your circumstances. Confirm the current procedure with the retailer and customs before travel.','2024-02-01',NULL,1790467200000,1790467200000,1790467200000,'seed-review',NULL,1790467200000,1790467200000),
('tf-jp-v1','tf-jp',1,'published','available','Japan tax-free shopping','Eligible non-resident visitors can buy qualifying goods tax-free at licensed shops under the rules in force before 1 November 2026.',
'["Eligible non-resident visitor status","Purchase is not for business or resale"]',
'["General goods and consumables bought at a licensed tax-free shop","Gold and platinum bullion are excluded"]',
'["Confirm the shop is licensed for tax-free sales","Show a passport or use supported Visit Japan Web information","Keep the electronic purchase record details"]',
'["Passport or supported Visit Japan Web record","Purchased goods"]',
'["Keep goods in Japan until departure","Consumables must remain in the required sealed packaging","Present passport and goods if customs requests them"]',
'{"export":"Take the goods out of Japan during the eligible stay"}',
'["Customs may inspect passport and goods at departure","Do not consume or transfer tax-free goods in Japan"]',
'["Purchase records are transmitted electronically","Electronic purchase records do not replace a customs inspection request"]',
'["Tax is removed at the licensed shop under the current system","No operator fee is assumed by this guide"]',
'A refund-method reform starts on 1 November 2026. Confirm which system applies on your purchase date.','2019-10-01','2026-10-31',1790467200000,1790467200000,1790467200000,'seed-review',NULL,1790467200000,1790467200000),
('tf-jp-v2','tf-jp',2,'published','available','Japan refund method','From 1 November 2026, eligible shoppers pay tax-inclusive prices and the licensed shop refunds the tax after customs confirms export.',
'["Eligible non-resident visitor status","Purchase is not for business or resale"]',
'["Qualifying goods bought at a licensed tax-free shop","The former general-goods and consumables distinction is abolished"]',
'["Confirm the shop is licensed for tax-free sales","Pay the tax-inclusive price","Keep the electronic purchase record and shop refund instructions"]',
'["Passport or supported Visit Japan Web record","Purchased goods","Retailer refund instructions"]',
'["Keep goods available for customs confirmation","Bring the goods out of Japan within 90 days"]',
'{"customsConfirmation":"Within 90 days from purchase"}',
'["Present the goods at the departure procedure checking counter when required","Customs confirmation is sent through the electronic system"]',
'["Customs confirms export electronically","Confirmation allows the shop to process a refund; customs does not pay it"]',
'["The licensed tax-free shop refunds the consumption-tax equivalent after confirmation","Timing and method follow the shop’s published terms"]',
'This rule applies from 1 November 2026. Confirm the retailer’s current refund method and timing.','2026-11-01',NULL,1790467200000,1790467200000,1790467200000,'seed-review','tf-jp-v1',1790467200000,1790467200000),
('tf-gb-v1','tf-gb',1,'published','unavailable','Great Britain tax-free shopping','The former VAT Retail Export Scheme is not available for goods carried away from Great Britain. Retailers can sell tax-free only when they deliver goods directly to an address outside the UK.',
'["No general tourist VAT refund for goods carried in personal baggage from England, Scotland or Wales"]',
'["A retailer may offer VAT-free export only when the goods are delivered directly outside the United Kingdom"]',
'["Ask the retailer whether direct export delivery is available","Do not rely on an airport refund for carried goods"]',
'[]','[]','{}','[]','[]','[]',
'Northern Ireland has a separate regional scheme. Confirm whether your purchase and departure fall under Northern Ireland rules.','2021-01-01',NULL,1790467200000,1790467200000,1790467200000,'seed-review',NULL,1790467200000,1790467200000),
('tf-gb-nir-v1','tf-gb-nir',1,'published','available','Northern Ireland VAT Retail Export Scheme','Qualifying visitors can use participating Northern Ireland retailers and validate exported goods with customs.',
'["Resident outside Northern Ireland and the European Union","Leaving Northern Ireland and the EU with the goods"]',
'["Eligible goods from a participating retailer","Motor vehicles, mail-order goods, services and goods already used in Northern Ireland are excluded"]',
'["Ask whether the retailer participates","Complete VAT 407(NI) with the retailer","Keep the form and receipts"]',
'["Passport or travel document","VAT 407(NI) form","Receipts","Goods"]',
'["Show goods, form and receipts to customs when leaving","Keep goods available before baggage check"]',
'{"export":"Export the goods by the end of the third month after purchase"}',
'["Present goods, form and receipts to UK or EU customs at the final exit","Follow the retailer’s instructions for returning the validated form"]',
'["Customs validation proves export","Validation is separate from the retailer or operator payout"]',
'["The retailer or refund company pays after receiving validated documents","A handling fee may be deducted"]',
'Participation is voluntary and regional rules apply. Confirm the process with the retailer before purchase.','2021-01-01',NULL,1790467200000,1790467200000,1790467200000,'seed-review',NULL,1790467200000,1790467200000);

INSERT OR IGNORE INTO tax_free_rates VALUES
('tf-rate-fr-20','tf-fr-v1','Standard goods',20,1,'Reduced rates can apply to some categories.'),
('tf-rate-fr-10','tf-fr-v1','Reduced-rate goods',10,1,'Category-dependent; confirm the rate on the invoice.'),
('tf-rate-fr-55','tf-fr-v1','Reduced-rate goods',5.5,1,'Category-dependent; confirm the rate on the invoice.'),
('tf-rate-it-22','tf-it-v1','Standard goods',22,1,'Italian customs states eligible goods may use rates from 4% to 22%.'),
('tf-rate-jp-10','tf-jp-v1','Standard goods',10,1,'The reduced 8% rate applies to specified food, drink and newspapers.'),
('tf-rate-jp-8','tf-jp-v1','Reduced-rate goods',8,1,'Category-dependent; confirm the rate on the receipt.'),
('tf-rate-jp2-10','tf-jp-v2','Standard goods',10,1,'Refund method from 1 November 2026.'),
('tf-rate-jp2-8','tf-jp-v2','Reduced-rate goods',8,1,'Category-dependent; confirm the rate on the receipt.');

INSERT OR IGNORE INTO tax_free_thresholds VALUES
('tf-th-fr','tf-fr-v1','Minimum purchase',100,NULL,'EUR','store_day','gt','Total including tax in the same store on the same day.'),
('tf-th-it','tf-it-v1','Minimum invoice',70,NULL,'EUR','invoice','gt','VAT included, per invoice.'),
('tf-th-jp-general','tf-jp-v1','General goods minimum',5000,NULL,'JPY','store_day','gte','Tax excluded, same purchaser, same store, same day.'),
('tf-th-jp-consumable','tf-jp-v1','Consumables range',5000,500000,'JPY','store_day','range','Tax excluded, same purchaser, same store, same day.');

INSERT OR IGNORE INTO tax_free_exit_instructions VALUES
('tf-exit-fr','tf-fr-v1','eu_final_exit',NULL,'Final EU departure','["Complete validation before checking baggage","Use the PABLO kiosk when leaving through France or the local customs route in another EU country"]','Keep goods accessible for inspection.'),
('tf-exit-it','tf-it-v1','eu_final_exit',NULL,'Final EU departure','["Obtain the customs visa","Italian exit points validate eligible electronic invoices through OTELLO"]','Carry goods in personal luggage and keep them accessible.'),
('tf-exit-jp','tf-jp-v1','country',NULL,'Departure from Japan','["Keep passport and goods ready","Follow customs instructions before departure"]','Do not check goods until any required inspection is complete.'),
('tf-exit-jp2','tf-jp-v2','country',NULL,'Departure from Japan','["Present goods at the departure procedure checking counter when required","Complete confirmation within 90 days of purchase"]','Keep goods accessible.'),
('tf-exit-nir','tf-gb-nir-v1','region',NULL,'Final Northern Ireland or EU departure','["Show goods, VAT 407(NI), receipts and travel document to customs","Return validated documents as instructed by the retailer"]','Keep goods accessible before baggage check.');

INSERT OR IGNORE INTO tax_free_sources VALUES
('tf-src-fr-guide','tf-fr-v1','https://www.douane.gouv.fr/fiche/la-detaxe-en-france-pour-les-touristes-pablo','www.douane.gouv.fr','French Customs','customs','Eligibility, threshold, PABLO validation, deadlines and payout separation','2024-01-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-fr-rate','tf-fr-v1','https://www.impots.gouv.fr/international-professionnel/tax4busines','www.impots.gouv.fr','French tax authority','tax_authority','French VAT rates','2024-01-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-it','tf-it-v1','https://www.adm.gov.it/portale/-/the-procedure','www.adm.gov.it','Italian Customs and Monopolies Agency','customs','OTELLO eligibility, threshold, process, fees and digital customs validation','2024-02-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-jp-rule','tf-jp-v1','https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6559.htm','www.nta.go.jp','Japan National Tax Agency','tax_authority','Current eligibility, thresholds, categories and exclusions','2026-04-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-jp-rate','tf-jp-v1','https://www.nta.go.jp/english/taxes/consumption_tax/01.htm','www.nta.go.jp','Japan National Tax Agency','tax_authority','Current consumption-tax rates','2019-10-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-jp-future','tf-jp-v2','https://www.nta.go.jp/publication/pamph/shohi/menzei/202506/pdf/0025006-106.pdf','www.nta.go.jp','Japan National Tax Agency','tax_authority','Refund-method reform effective 1 November 2026','2026-11-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-gb','tf-gb-v1','https://www.gov.uk/tax-on-shopping/taxfree-shopping','www.gov.uk','UK Government','tax_authority','Great Britain withdrawal and Northern Ireland regional scheme','2021-01-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1),
('tf-src-nir','tf-gb-nir-v1','https://www.gov.uk/tax-on-shopping/taxfree-shopping','www.gov.uk','UK Government','tax_authority','Northern Ireland eligibility, exclusions, form, customs and payment','2021-01-01',1790467200000,NULL,NULL,NULL,NULL,1791072000000,1);

INSERT OR IGNORE INTO tax_free_publication_history VALUES
('tf-pub-fr-1','tf-fr','tf-fr-v1','publish','seed-review','Initial official-source review',1790467200000),
('tf-pub-it-1','tf-it','tf-it-v1','publish','seed-review','Initial official-source review',1790467200000),
('tf-pub-jp-1','tf-jp','tf-jp-v1','publish','seed-review','Current system',1790467200000),
('tf-pub-jp-2','tf-jp','tf-jp-v2','publish','seed-review','Future effective rule',1790467200000),
('tf-pub-gb-1','tf-gb','tf-gb-v1','publish','seed-review','Great Britain unavailable with regional exception',1790467200000),
('tf-pub-nir-1','tf-gb-nir','tf-gb-nir-v1','publish','seed-review','Northern Ireland regional scheme',1790467200000);
