import { readFileSync, writeFileSync } from "node:fs";

const app = readFileSync("public/mobile-app.js", "utf8");
const codes = app.match(/TAX_FREE_COUNTRIES = Object\.freeze\("([A-Z ]+)"\.split\(" "\)\)/)[1].split(" ");
const checkedAt = 1790467200000;
const nextReviewAt = 1806278400000;
const q = (value) => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
const json = (value) => q(JSON.stringify(value));

const rules = [
  {
    code:"JE", version:2, status:"verified_available", availability:"available", program:"GST visitor refund scheme",
    summary:"Eligible visitors can reclaim Jersey GST on qualifying goods bought from an approved retailer and exported on a scheduled commercial flight or ferry.",
    eligibility:["Not resident in Jersey","Present in Jersey for no more than 60 days in the calendar year","At least 16 years old","Not a crew member on the departing flight"],
    purchases:["More than £100 with one approved retailer on the same day","Goods must carry GST and come from an approved retailer","Services, consumed goods, tobacco, vapes and fuel are excluded"],
    store:["Confirm that the retailer participates","Complete the approved online Global Blue tax-free form","Keep the original payment receipts"],
    documents:["Passport or approved identity document","Original payment receipts","Global Blue tax-free record"],
    goods:["Take the goods out of Jersey","Keep goods available for any requested export check","Do not consume eligible goods before departure"],
    deadlines:{export:"Leave Jersey with the goods within one month of purchase"},
    customs:["Validate export at a Global Blue kiosk after security at Jersey Airport or in the Elizabeth ferry terminal"],
    electronic:["Use the Global Blue kiosk with identity documents and original receipts"],
    payout:["Global Blue processes the refund under the approved scheme","Operator charges may reduce the amount paid"],
    disclaimer:"The official visitor scheme rules are verified. Kiosk opening hours are not published on the government page, so confirm access before departure.",
    source:{url:"https://www.gov.je/taxesmoney/gst/gstcustomers/pages/gstrefundsvisitors.aspx",host:"www.gov.je",publisher:"Government of Jersey",type:"tax_authority",scope:"Eligibility, £100 threshold, one-month deadline, exclusions and validation locations"},
    rate:["Standard GST",5], threshold:["Published minimum",100,"JEP","store_day","gt","More than £100 with one approved retailer on the same day."],
    point:{id:"jer",type:"airport",code:"JER",name:"Jersey Airport",city:"Jersey",timezone:"Europe/Jersey",terminal:"Departures",zone:"Global Blue kiosk after security",service:"combined",operator:"Global Blue",hours:"not_published",details:"Use the Global Blue kiosk after security with your passport or approved ID and original payment receipts.",before:0,instructions:["arrive_early","show_documents_goods","validation_before_payment"],baggage:"keep_accessible"},
  },
  {
    code:"PE", version:2, status:"verified_available", availability:"available", program:"Tourist IGV refund — Tax Free Peru",
    summary:"Foreign non-domiciled tourists staying 2 to 60 days can request an IGV refund for qualifying goods bought in person from authorized establishments.",
    eligibility:["Foreign individual not domiciled in Peru","Entered Peru as a tourist","Stay is at least 2 and no more than 60 calendar days per entry"],
    purchases:["Goods bought in person from an authorized establishment","At least PEN 100 per qualifying purchase","Services do not qualify","Payment must use an internationally valid card in the tourist's name"],
    store:["State that you intend to claim before the invoice is issued","Obtain a Tax Free invoice and certificate","Keep the goods with you for export"],
    documents:["Travel identity document","Tax Free invoice","Tax Free certificate","Eligible debit or credit card in the tourist's name"],
    goods:["The tourist who bought the goods must personally take them out of Peru"],
    deadlines:{application:"Submit the request before the authorized stay in Peru ends",payment:"The collaborating entity states payment within five calendar days after a valid request"},
    customs:["Complete the departure validation assigned by the self-service kiosk or mobile application","Present goods when the system assigns the inspection channel"],
    electronic:["Use the self-service module in the pre-boarding control area on the third floor of the new Jorge Chávez terminal or the supported mobile application"],
    payout:["Refund is credited to the registered debit or credit card","The collaborating entity may deduct a disclosed service fee"],
    disclaimer:"SUNAT publishes the operational process and Lima airport location. Confirm the authorized-store list and current operator terms before purchase.",
    source:{url:"https://emprender.sunat.gob.pe/principales-impuestos/imp-general-las-ventas-igv/tax-free",host:"emprender.sunat.gob.pe",publisher:"SUNAT",type:"tax_authority",scope:"Current eligibility, purchase rules, Lima kiosk location, payout and 2025 operational update"},
    rate:["Standard IGV",18], threshold:["Minimum purchase",100,"PEN","item","gte","The official traveler guide states a minimum purchase of PEN 100."],
    point:{id:"lim",type:"airport",code:"LIM",name:"Jorge Chávez International Airport",city:"Lima",timezone:"America/Lima",terminal:"New terminal · third floor",zone:"Pre-boarding control area self-service module",service:"combined",operator:"Global Blue Perú",hours:"not_published",details:"Use the self-service module or supported mobile application. The system may assign a green or red inspection channel.",before:1,instructions:["before_checkin","show_documents_goods","validation_before_payment"],baggage:"hold_before_checkin"},
  },
  {
    code:"CH", version:2, status:"verified_available", availability:"available", program:"Tax-free for tourists",
    summary:"A supplier can exempt or refund Swiss VAT when a visitor domiciled abroad exports qualifying retail goods and obtains the required export confirmation.",
    eligibility:["Domiciled outside Switzerland","Buyer is the person named on the export document"],
    purchases:["Retail price is at least CHF 300 including VAT","Goods are exported in tourist traffic"],
    store:["Ask the supplier for the export document","Confirm how the supplier or refund operator will pay after export proof"],
    documents:["Official identity document","Purchase receipt","Swiss export document"],
    goods:["Carry the qualifying goods out of Switzerland and keep them available for customs confirmation"],
    deadlines:{export:"Export and customs confirmation within 90 days of purchase"},
    customs:["Obtain export confirmation when leaving Swiss territory"],
    electronic:[],
    payout:["The supplier or its refund operator handles repayment","Swiss tax and customs authorities do not pay the traveler directly"],
    disclaimer:"The legal conditions are verified. Refund handling is a private-law matter with the seller, and airport desk hours can vary.",
    source:{url:"https://www.estv.admin.ch/en/tax-free-for-tourists",host:"www.estv.admin.ch",publisher:"Swiss Federal Tax Administration",type:"tax_authority",scope:"Eligibility, CHF 300 threshold, export documentation and responsibility for repayment"},
    rate:["Standard VAT",8.1], threshold:["Published minimum",300,"CHF","receipt","gte","Minimum retail price including VAT."],
    point:{id:"gva",type:"airport",code:"GVA",name:"Geneva Airport",city:"Geneva",timezone:"Europe/Zurich",terminal:"Departures",zone:"Customs validation followed by Change Helvetic or Tax Refund / VAT Refund desk",service:"combined",operator:"Change Helvetic",hours:"not_published",details:"First obtain customs validation, then use the refund counter for an eligible cash or card payment.",before:1,instructions:["arrive_early","show_documents_goods","validation_before_payment"],baggage:"hold_before_checkin",source:{url:"https://www.gva.ch/en/passengers/travel-preparation/services/our-services/tax-vat-refund",host:"www.gva.ch",publisher:"Geneva Airport",type:"airport",scope:"Geneva Airport refund flow and service counters"}},
  },
  {
    code:"AM", version:1, status:"verified_available", availability:"available", program:"VAT refund for foreign visitors",
    summary:"Armenia refunds VAT to foreign citizens and stateless persons who export qualifying unused goods under the government procedure.",
    eligibility:["Foreign citizen or stateless person","Buyer named on the VAT refund tax invoice"],
    purchases:["At least AMD 50,000 including VAT from the same taxpayer in one calendar day","Food, tobacco, medicines, cultural property and vehicles are excluded"],
    store:["Request the VAT refund tax invoice and check the personal and purchase details"],
    documents:["Passport or travel identity document","VAT refund tax invoice","Purchase documentation"],
    goods:["Goods must be unused and retain factory packaging or labeling","Present goods for export verification"],
    deadlines:{export:"Export within 90 days after purchase"},
    customs:["Complete export confirmation at an Armenian border customs point"],
    electronic:[], payout:["Follow the official invoice return procedure after customs confirmation"],
    disclaimer:"The government decision and 2023 amendments are verified. Exact counter locations and hours depend on the departure point and are not published in this record.",
    source:{url:"https://www.arlis.am/en/acts/181106",host:"www.arlis.am",publisher:"Armenian Legal Information System",type:"law",scope:"Eligibility, AMD 50,000 threshold, 90-day export deadline and exclusions"},
    rate:["Standard VAT",20], threshold:["Published minimum",50000,"AMD","store_day","gte","Goods from the same taxpayer in one calendar day, VAT included."],
  },
  {
    code:"GE", version:1, status:"verified_available", availability:"available", program:"Tax Free Georgia",
    summary:"Foreign citizens can reclaim Georgian VAT on qualifying goods bought from an authorized Tax Free retailer and exported from Georgia.",
    eligibility:["Foreign citizen named on the Tax Free receipt"],
    purchases:["More than GEL 200 excluding VAT on one Tax Free receipt","Perishable goods, vehicles, most export-restricted goods and specified precious goods are excluded"],
    store:["Buy from an authorized Tax Free retailer","Obtain the special Tax Free receipt","Keep the seller's required packaging and seal intact"],
    documents:["Passport or travel identity document","Special Tax Free receipt","Purchased goods"],
    goods:["Do not open sealed packaging before Revenue Service validation","All goods listed on the receipt must be exported"],
    deadlines:{export:"Export within three months of purchase"},
    customs:["Present the goods and Tax Free receipt at the Georgian border checkpoint"],
    electronic:[], payout:["Refund is paid only to the person named on the receipt after export is confirmed"],
    disclaimer:"The Revenue Service rules are verified. Exact refund desks and working hours are not published in this record.",
    source:{url:"https://www.rs.ge/TaxFreeInfo",host:"www.rs.ge",publisher:"Georgia Revenue Service",type:"tax_authority",scope:"Program operation, GEL 200 threshold, packaging, exclusions and three-month deadline"},
    rate:["Standard VAT",18], threshold:["Published minimum",200,"GEL","receipt","gt","More than GEL 200 excluding VAT on one receipt."],
  },
  {
    code:"MX", version:1, status:"verified_available", availability:"available", program:"VAT refunds for foreign tourists",
    summary:"Foreign tourists departing Mexico by air or sea can request a VAT refund for qualifying merchandise under the SAT program.",
    eligibility:["Foreign visitor with tourist status","Departing Mexico by air or sea"],
    purchases:["At least MXN 1,200 per establishment","Electronic payment qualifies; cash purchases are limited under the current SAT rules"],
    store:["Obtain a compliant tax invoice showing the merchandise and VAT"],
    documents:["Original valid passport","Boarding pass or proof of departure","Tax invoices","Purchased merchandise","Refund application from the authorized concessionaire"],
    goods:["Merchandise must actually leave Mexico and be presented when requested"],
    deadlines:{departure:"Complete the procedure at the authorized point before leaving Mexico"},
    customs:["Present the goods and documents to the authorized concessionaire at a covered airport or seaport"],
    electronic:[], payout:["Refund normally returns to an electronic payment method","An authorized concessionaire may deduct its disclosed administration cost"],
    disclaimer:"SAT confirms the legal program and traveler requirements. Tripto has not verified a current complete list of operating airport and seaport counters, so confirm the departure point before purchase.",
    source:{url:"https://wwwmat.sat.gob.mx/tramites/26375/solicita-el-reintegro-de-cantidades-de-iva-a-turistas-extranjeros",host:"wwwmat.sat.gob.mx",publisher:"Mexico Tax Administration Service (SAT)",type:"tax_authority",scope:"Program basis, tourist eligibility, MXN 1,200 threshold and payment requirements"},
    rate:["Standard VAT",16], threshold:["Published minimum",1200,"MXN","other","gte","Minimum merchandise purchase per establishment."],
  },
  {
    code:"OM", version:1, status:"partial", availability:"partial", program:"Tourist VAT refund under Oman VAT rules",
    summary:"Oman's Tax Authority states that visitors and tourists can obtain a VAT refund subject to the conditions in the regulations for travel outside the GCC.",
    eligibility:["Visitor or tourist travelling to or from Oman from outside the GCC","Eligibility depends on the detailed VAT regulations"],
    purchases:["Only goods and minimum values allowed by the regulations qualify"],
    store:["Ask the retailer whether the current tourist refund procedure is operational before purchase"],
    documents:["Passport or travel document","Tax invoice","Goods when inspection is required"],
    goods:["Keep goods available for export verification"], deadlines:{review:"Operational deadlines require confirmation with the Tax Authority"},
    customs:["Departure locations and exact processing steps are not yet confirmed in this record"], electronic:[], payout:["Refund method and operator require current confirmation"],
    disclaimer:"The legal entitlement is confirmed by the Oman Tax Authority, but Tripto has not confirmed a current public list of operating traveler counters, hours, payout methods or all thresholds.",
    source:{url:"https://tms.taxoman.gov.om/portal/vat-faqs",host:"tms.taxoman.gov.om",publisher:"Oman Tax Authority",type:"tax_authority",scope:"Legal availability for visitors and tourists; operational details remain incomplete"},
    rate:["Standard VAT",5],
  },
  {
    code:"UZ", version:1, status:"partial", availability:"partial", program:"Tax Free Uzbekistan",
    summary:"Uzbekistan's Tax Committee publishes a Tax Free refund procedure for foreign visitors, but Tripto has not completed a current airport-by-airport operational review.",
    eligibility:["Foreign visitor meeting the official Tax Free procedure"], purchases:["Qualifying goods bought from participating retailers"],
    store:["Request the official Tax Free purchase documentation"], documents:["Passport","Tax Free purchase documents","Goods"],
    goods:["Keep goods available for export confirmation"], deadlines:{review:"Confirm current filing and export deadlines in the official guide"},
    customs:["Follow the official departure validation procedure"], electronic:[], payout:["Use the payment method allowed by the official Tax Free application"],
    disclaimer:"An official Tax Free procedure is published, but thresholds, supported airports, hours and current operator terms remain under review.",
    source:{url:"https://taxfree.soliq.uz/static/qqs_ru-11052d43061755257353ad7f20099c0d.pdf",host:"taxfree.soliq.uz",publisher:"Uzbekistan Tax Committee",type:"tax_authority",scope:"Official Tax Free procedure; operational details remain partial"},
  },
  {
    code:"HK", version:1, status:"verified_unavailable", availability:"unavailable", program:"No VAT or general sales tax",
    summary:"Hong Kong does not levy VAT, GST or a general sales tax, so there is no general tourist VAT refund to claim.",
    eligibility:[], purchases:[], store:[], documents:[], goods:[], deadlines:{}, customs:[], electronic:[], payout:[],
    disclaimer:"This refers to a general VAT/GST or sales-tax refund. Product duties and import rules are separate.",
    source:{url:"https://www.fstb.gov.hk/en/treasury/general/prevailing-tax-policy.htm",host:"www.fstb.gov.hk",publisher:"Hong Kong Financial Services and the Treasury Bureau",type:"tax_authority",scope:"Official confirmation that Hong Kong has no VAT or sales tax"},
  },
  {
    code:"NZ", version:1, status:"verified_unavailable", availability:"unavailable", program:"No general GST refund for visitors",
    summary:"Visitors pay New Zealand GST like residents and cannot claim a general refund for goods or services bought in New Zealand.",
    eligibility:[], purchases:[], store:[], documents:[], goods:[], deadlines:{}, customs:[], electronic:[], payout:[],
    disclaimer:"Supplier-exported and licensed duty-free transactions can be zero-rated, but a visitor carrying ordinary retail purchases has no general GST refund.",
    source:{url:"https://www.ird.govt.nz/-/media/project/ir/home/documents/forms-and-guides/ir200---ir299/ir294/ir294-2024.pdf",host:"www.ird.govt.nz",publisher:"New Zealand Inland Revenue",type:"tax_authority",scope:"Official visitor guidance confirming no general GST exemption or refund"},
  },
];

const out = [
  "-- Worldwide Tax Free research ledger and reviewed country-rule expansion.",
  "-- A screening result is evidence of research, not evidence that a refund is unavailable.\n",
  `CREATE TABLE IF NOT EXISTS tax_free_research_checks (
    id TEXT PRIMARY KEY,
    territory_id TEXT NOT NULL REFERENCES tax_free_territories(id) ON DELETE CASCADE,
    result TEXT NOT NULL CHECK (result IN ('official_available','official_unavailable','official_partial','operator_evidence','global_screen_no_conclusion')),
    source_url TEXT NOT NULL,
    publisher TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('tax_authority','customs','airport','law','operator','professional_tax_guide')),
    finding_summary TEXT NOT NULL,
    checked_at INTEGER NOT NULL,
    next_review_at INTEGER,
    UNIQUE(territory_id, source_url)
  );`,
  "CREATE INDEX IF NOT EXISTS idx_tax_free_research_territory ON tax_free_research_checks(territory_id, result, checked_at);",
  `INSERT OR IGNORE INTO tax_free_research_checks (id,territory_id,result,source_url,publisher,source_kind,finding_summary,checked_at,next_review_at)
   SELECT 'tf-research-global-' || lower(country_code),id,'global_screen_no_conclusion',
    'https://taxsummaries.pwc.com/quick-charts/value-added-tax-vat-rates','PwC Worldwide Tax Summaries','professional_tax_guide',
    'Worldwide VAT/GST table screened. This cross-country source does not establish whether a traveler refund operates in this territory; country-authority confirmation is still required.',
    ${checkedAt},${nextReviewAt}
   FROM tax_free_territories WHERE region_code IS NULL;`,
];

for (const rule of rules) {
  const territory = `tf-${rule.code.toLowerCase()}`;
  const ruleId = `${territory}-research-v${rule.version}`;
  const result = rule.status === "verified_available" ? "official_available" : rule.status === "verified_unavailable" ? "official_unavailable" : "official_partial";
  out.push(`INSERT OR REPLACE INTO tax_free_research_checks (id,territory_id,result,source_url,publisher,source_kind,finding_summary,checked_at,next_review_at) VALUES (${q(`tf-research-official-${rule.code.toLowerCase()}`)},${q(territory)},${q(result)},${q(rule.source.url)},${q(rule.source.publisher)},${q(rule.source.type)},${q(rule.source.scope)},${checkedAt},${nextReviewAt});`);
  if (rule.version > 1) out.push(`UPDATE tax_free_rule_versions SET lifecycle='retired',effective_to='2026-09-26',updated_at=${checkedAt} WHERE territory_id=${q(territory)} AND lifecycle='published';`);
  out.push(`UPDATE tax_free_territories SET status=${q(rule.status)},regional_note=${q(rule.disclaimer)},updated_at=${checkedAt} WHERE id=${q(territory)};`);
  out.push(`INSERT OR IGNORE INTO tax_free_rule_versions (id,territory_id,version_number,lifecycle,availability,program_name,summary,eligibility_json,purchases_json,store_steps_json,documents_json,goods_json,deadlines_json,customs_json,electronic_validation_json,payout_json,disclaimer,effective_from,effective_to,content_verified_at,source_checked_at,published_at,published_by,supersedes_version_id,created_at,updated_at) VALUES (${q(ruleId)},${q(territory)},${rule.version},'published',${q(rule.availability)},${q(rule.program)},${q(rule.summary)},${json(rule.eligibility)},${json(rule.purchases)},${json(rule.store)},${json(rule.documents)},${json(rule.goods)},${json(rule.deadlines)},${json(rule.customs)},${json(rule.electronic)},${json(rule.payout)},${q(rule.disclaimer)},'2026-09-27',NULL,${checkedAt},${checkedAt},${checkedAt},'world-research-review',${rule.version > 1 ? q(`${territory}-world-v1`) : "NULL"},${checkedAt},${checkedAt});`);
  out.push(`INSERT OR IGNORE INTO tax_free_sources (id,rule_version_id,url,host,publisher,source_type,claim_scope,effective_from,checked_at,etag,last_modified,content_hash,last_technical_check_at,next_check_at,active) VALUES (${q(`tf-src-${rule.code.toLowerCase()}-research`)},${q(ruleId)},${q(rule.source.url)},${q(rule.source.host)},${q(rule.source.publisher)},${q(rule.source.type)},${q(rule.source.scope)},NULL,${checkedAt},NULL,NULL,NULL,${checkedAt},${nextReviewAt},1);`);
  if (rule.rate) out.push(`INSERT OR IGNORE INTO tax_free_rates (id,rule_version_id,category,rate,price_includes_tax,notes) VALUES (${q(`tf-rate-${rule.code.toLowerCase()}-research`)},${q(ruleId)},${q(rule.rate[0])},${rule.rate[1]},1,'Use the category and rate shown on the actual invoice; reduced and exempt categories can differ.');`);
  if (rule.threshold) {
    const [label,amount,currency,basis,comparison,notes] = rule.threshold;
    out.push(`INSERT OR IGNORE INTO tax_free_thresholds (id,rule_version_id,label,amount,maximum_amount,currency,basis,comparison,notes) VALUES (${q(`tf-th-${rule.code.toLowerCase()}-research`)},${q(ruleId)},${q(label)},${amount},NULL,${q(currency)},${q(basis)},${q(comparison)},${q(notes)});`);
  }
  const point = rule.point;
  if (point) {
    let sourceId = `tf-src-${rule.code.toLowerCase()}-research`;
    if (point.source) {
      sourceId = `tf-src-${rule.code.toLowerCase()}-${point.id}-research`;
      out.push(`INSERT OR IGNORE INTO tax_free_sources (id,rule_version_id,url,host,publisher,source_type,claim_scope,effective_from,checked_at,etag,last_modified,content_hash,last_technical_check_at,next_check_at,active) VALUES (${q(sourceId)},${q(ruleId)},${q(point.source.url)},${q(point.source.host)},${q(point.source.publisher)},${q(point.source.type)},${q(point.source.scope)},NULL,${checkedAt},NULL,NULL,NULL,${checkedAt},${nextReviewAt},1);`);
    }
    out.push(`INSERT OR IGNORE INTO tax_free_departure_points (id,rule_version_id,location_type,location_code,location_name,city,timezone,terminal,zone,service_type,operator_name,hours_status,hours_json,location_details,before_security,instruction_codes_json,baggage_code,contact_json,map_url,source_id,content_verified_at,source_checked_at,active) VALUES (${q(`tf-point-${rule.code.toLowerCase()}-${point.id}-research`)},${q(ruleId)},${q(point.type)},${q(point.code)},${q(point.name)},${q(point.city)},${q(point.timezone)},${q(point.terminal)},${q(point.zone)},${q(point.service)},${q(point.operator)},${q(point.hours)},${json({kind:point.hours})},${q(point.details)},${point.before},${json(point.instructions)},${q(point.baggage)},NULL,NULL,${q(sourceId)},${checkedAt},${checkedAt},1);`);
  }
  out.push(`INSERT OR IGNORE INTO tax_free_publication_history (id,territory_id,rule_version_id,action,actor,notes,created_at) VALUES (${q(`tf-history-${rule.code.toLowerCase()}-research-v${rule.version}`)},${q(territory)},${q(ruleId)},'publish','world-research-review','Published after country-source review on 2026-09-27.',${checkedAt});`);
}

writeFileSync("migrations/0032_tax_free_research_expansion.sql", `${out.join("\n\n")}\n`);
console.log(JSON.stringify({screenedCountries:codes.length,reviewedRules:rules.length}));
