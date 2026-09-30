import { readFileSync, writeFileSync } from "node:fs";

const app = readFileSync("public/mobile-app.js", "utf8");
const codes = app.match(/TAX_FREE_COUNTRIES = Object\.freeze\("([A-Z ]+)"\.split\(" "\)\)/)[1].split(" ");
const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
const verifiedAt = 1790467200000;
const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
const existing = new Set(["FR", "IT", "JP", "GB"]);
const eu = new Set("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" "));
const globalBlue = {
  CH: "switzerland", ES: "spain", PT: "portugal", KR: "south-korea", IT: "italy", GR: "greece",
  FR: "france", AT: "austria", CO: "colombia", NO: "norway", HR: "croatia", LV: "latvia",
  IE: "ireland", DK: "denmark", BS: "bahamas", RS: "serbia", LT: "lithuania", KZ: "kazakhstan",
  LB: "lebanon", SE: "sweden", EE: "estonia", SA: "saudi-arabia", GB: "united-kingdom",
  LU: "luxembourg", SG: "singapore", CN: "china", IS: "iceland", TR: "turkey", MA: "morocco",
  UY: "uruguay", BE: "belgium", PE: "peru", NL: "netherlands", HU: "hungary", JE: "jersey",
  SK: "slovakia", CZ: "czech-republic", FI: "finland", PL: "poland", JP: "japan", DE: "germany",
  CY: "cyprus", AR: "argentina",
};
const official = {
  AU: { program: "Tourist Refund Scheme (TRS)", url: "https://www.abf.gov.au/entering-and-leaving-australia/tourist-refund-scheme", host: "www.abf.gov.au", publisher: "Australian Border Force", type: "customs", summary: "Australia operates the Tourist Refund Scheme for eligible GST and WET paid on qualifying goods taken offshore." },
  SG: { program: "Electronic Tourist Refund Scheme (eTRS)", url: "https://www.iras.gov.sg/taxes/goods-services-tax-(gst)/consumers/tourist-refund-scheme", host: "www.iras.gov.sg", publisher: "Inland Revenue Authority of Singapore", type: "tax_authority", summary: "Singapore operates eTRS for eligible tourists buying goods from participating retailers and departing through Changi or Seletar." },
  AE: { program: "Tourist VAT Refund Scheme", url: "https://tax.gov.ae/en/services/tourist.vat.refunds.aspx", host: "tax.gov.ae", publisher: "UAE Federal Tax Authority", type: "tax_authority", summary: "The UAE operates a digital tourist VAT refund scheme through registered retailers and validation points at air, land and sea exits." },
  AZ: { program: "Tax Free shopping", url: "https://www.airport.az/en/facilities/vat-refund/", host: "www.airport.az", publisher: "Heydar Aliyev International Airport", type: "airport", summary: "Azerbaijan provides Tax Free shopping and airport VAT refund processing for eligible foreign visitors." },
  IL: { program: "Tourist VAT refund", url: "https://www.gov.il/en/pages/vat-refund-guide-for-tourists?chapterIndex=1", host: "www.gov.il", publisher: "Israel Tax Authority", type: "tax_authority", summary: "Israel provides VAT refunds to eligible tourists for qualifying goods bought from approved businesses." },
  TH: { program: "VAT Refund for Tourists", url: "https://vrtweb.rd.go.th/106.html", host: "vrtweb.rd.go.th", publisher: "Thailand Revenue Department", type: "tax_authority", summary: "Thailand operates a VAT Refund for Tourists scheme for eligible goods bought from participating retailers." },
  TW: { program: "VAT Refund for Foreign Travelers", url: "https://www.dot.gov.tw/Eng/singlehtml/en122?cntId=1b3e884630924fc1bc647351a191565b", host: "www.dot.gov.tw", publisher: "Taiwan Ministry of Finance", type: "tax_authority", summary: "Taiwan provides VAT refunds to eligible foreign travelers through airports, ports, authorized stores and designated counters." },
  ID: { program: "VAT Refund for Tourists", url: "https://www.pajak.go.id/panduan-layanan-pajak/konten/pembayaran/2025/vat-refund-for-tourist/permohonan-vat-refund-for-tourist", host: "www.pajak.go.id", publisher: "Indonesia Directorate General of Taxes", type: "tax_authority", summary: "Indonesia operates a VAT refund service for qualifying foreign-passport tourists taking eligible goods out of Indonesia." },
  ZA: { program: "VAT refund for tourists", url: "https://www.sars.gov.za/types-of-tax/value-added-tax/vat-refunds-for-tourists-and-foreign-enterprises/", host: "www.sars.gov.za", publisher: "South African Revenue Service", type: "tax_authority", summary: "South Africa has a VAT refund mechanism for qualifying purchasers exporting eligible goods through designated commercial ports." },
  PH: { program: "Tourist VAT Refund Program", url: "https://bir-cdn.bir.gov.ph/BIR/pdf/PR95DEC0924.pdf", host: "bir-cdn.bir.gov.ph", publisher: "Philippines Bureau of Internal Revenue", type: "tax_authority", summary: "The Philippines has established a VAT refund program for eligible foreign tourists purchasing qualifying goods." },
};
const planet = { BH: "bahrain", FO: "faroe-islands" };
const known = new Set([...eu, ...Object.keys(globalBlue), ...Object.keys(official), ...Object.keys(planet)]);
for (const code of existing) known.delete(code);

const output = [
  "-- Worldwide Tax Free directory baseline.",
  "-- Every ISO territory gets an explicit research record. Program evidence from",
  "-- an operator is published as partial, never as a complete legal determination.\n",
];

output.push(`INSERT OR IGNORE INTO tax_free_territories (id,country_code,region_code,name,parent_id,status,regional_note,created_at,updated_at) VALUES\n${codes.map((code, index) => `('tf-${code.toLowerCase()}','${code}',NULL,${sql(displayNames.of(code) || code)},NULL,'unverified','Country record created; tourist refund rules are still under review. This status does not mean that a refund is unavailable.',${verifiedAt},${verifiedAt})${index === codes.length - 1 ? ";" : ","}`).join("\n")}`);
for (const code of [...known].sort()) {
  output.push(`UPDATE tax_free_territories SET status='partial',regional_note='A tourist tax-free route is documented, but thresholds, local exceptions and departure details may still require country-level review.',updated_at=${verifiedAt} WHERE country_code='${code}' AND region_code IS NULL AND status='unverified';`);
}

function sourceFor(code) {
  if (official[code]) return official[code];
  if (eu.has(code)) return {
    program: "EU tourist VAT refund — local procedure pending review",
    url: "https://europa.eu/youreurope/citizens/consumers/shopping/vat/index_en.htm",
    host: "europa.eu", publisher: "European Union — Your Europe", type: "law",
    summary: `EU law provides a VAT-refund route for eligible non-EU residents exporting goods from ${displayNames.of(code)}; national thresholds and processing details vary.`,
  };
  if (globalBlue[code]) return {
    program: "Tourist tax-free shopping — partial country guide",
    url: `https://www.globalblue.com/en/shoppers/how-to-shop-tax-free/destinations/${globalBlue[code]}`,
    host: "www.globalblue.com", publisher: "Global Blue", type: "operator",
    summary: `A tax-free shopping route is documented for ${displayNames.of(code)}. Tripto has confirmed operator-country coverage; legal thresholds and all local exceptions remain under review.`,
  };
  return {
    program: "Tourist tax-free shopping — partial country guide",
    url: `https://taxfree.weareplanet.com/countries/${planet[code]}`,
    host: "taxfree.weareplanet.com", publisher: "Planet Tax Free", type: "operator",
    summary: `A tax-free shopping route is documented for ${displayNames.of(code)}. Tripto has confirmed operator-country coverage; legal thresholds and all local exceptions remain under review.`,
  };
}

for (const code of [...known].sort()) {
  const source = sourceFor(code);
  const ruleId = `tf-${code.toLowerCase()}-world-v1`;
  const territoryId = `tf-${code.toLowerCase()}`;
  output.push(`INSERT OR IGNORE INTO tax_free_rule_versions (id,territory_id,version_number,lifecycle,availability,program_name,summary,eligibility_json,purchases_json,store_steps_json,documents_json,goods_json,deadlines_json,customs_json,electronic_validation_json,payout_json,disclaimer,effective_from,effective_to,content_verified_at,source_checked_at,published_at,published_by,supersedes_version_id,created_at,updated_at) VALUES (${sql(ruleId)},${sql(territoryId)},1,'published','partial',${sql(source.program)},${sql(source.summary)},'["Eligibility depends on residence and visitor status under the local rules"]','["Only qualifying goods from participating retailers; exclusions vary by country"]','["Confirm participation before paying","Ask for the required tax-free document and verify every personal detail"]','["Passport or accepted travel document","Original receipt or invoice","Tax-free form or electronic record when required"]','["Keep goods unused and accessible when the local procedure requires inspection"]','{"review":"Open the linked country source for current export and filing deadlines"}','["Follow the official final-departure procedure and complete validation before baggage check-in when instructed"]','["Electronic validation confirms export; it does not necessarily pay the refund"]','["The retailer or named operator pays the refund after required validation","Fees and payout timing depend on the local program and operator"]','Tripto has verified evidence that a traveler tax-free route exists, but this country record is partial. Confirm thresholds, eligibility, deadlines, airports and fees in the linked source before purchase and departure.','2026-09-27',NULL,${verifiedAt},${verifiedAt},${verifiedAt},'world-directory-review',NULL,${verifiedAt},${verifiedAt});`);
  output.push(`INSERT OR IGNORE INTO tax_free_sources (id,rule_version_id,url,host,publisher,source_type,claim_scope,effective_from,checked_at,etag,last_modified,content_hash,last_technical_check_at,next_check_at,active) VALUES (${sql(`tf-src-${code.toLowerCase()}-world`)},${sql(ruleId)},${sql(source.url)},${sql(source.host)},${sql(source.publisher)},${sql(source.type)},'Program existence and high-level traveler route; country details remain partial',NULL,${verifiedAt},NULL,NULL,NULL,NULL,${verifiedAt + 604800000},1);`);
}

const rates = { AU: [10, "Standard GST"], SG: [9, "Standard GST"], AE: [5, "Standard VAT"], TW: [5, "Standard VAT"], TH: [7, "Standard VAT"], IL: [18, "Standard VAT"], ZA: [15, "Standard VAT"] };
for (const [code, [rate, label]] of Object.entries(rates)) {
  output.push(`INSERT OR IGNORE INTO tax_free_rates (id,rule_version_id,category,rate,price_includes_tax,notes) VALUES ('tf-rate-${code.toLowerCase()}-world','tf-${code.toLowerCase()}-world-v1',${sql(label)},${rate},1,'Category and exclusions can vary; confirm the invoice and official country guide.');`);
}
const thresholds = {
  AU: [300, "AUD", "other", "gte", "Combined invoices from one supplier ABN within the permitted purchase period."],
  SG: [100, "SGD", "store_day", "gte", "Up to three same-day invoices from the same GST registration number and shop name."],
  AE: [250, "AED", "receipt", "gte", "Minimum tax-free transaction stated by the official scheme guide."],
  TW: [2000, "TWD", "store_day", "gte", "Same authorized store on the same day, tax included."],
  TH: [2000, "THB", "store_day", "gte", "Same participating store on the same day, VAT included."],
  IL: [186, "ILS", "store_day", "gte", "Minimum purchase amount including VAT on the purchase day."],
};
for (const [code, [amount, currency, basis, comparison, notes]] of Object.entries(thresholds)) {
  output.push(`INSERT OR IGNORE INTO tax_free_thresholds (id,rule_version_id,label,amount,maximum_amount,currency,basis,comparison,notes) VALUES ('tf-th-${code.toLowerCase()}-world','tf-${code.toLowerCase()}-world-v1','Published minimum',${amount},NULL,'${currency}','${basis}','${comparison}',${sql(notes)});`);
}

const points = [];
for (const [code, name, city, timezone] of [
  ["ADL", "Adelaide Airport", "Adelaide", "Australia/Adelaide"], ["BNE", "Brisbane Airport", "Brisbane", "Australia/Brisbane"],
  ["CNS", "Cairns Airport", "Cairns", "Australia/Brisbane"], ["CBR", "Canberra Airport", "Canberra", "Australia/Sydney"],
  ["DRW", "Darwin International Airport", "Darwin", "Australia/Darwin"], ["OOL", "Gold Coast Airport", "Gold Coast", "Australia/Brisbane"],
  ["HBA", "Hobart Airport", "Hobart", "Australia/Hobart"], ["MEL", "Melbourne Airport", "Melbourne", "Australia/Melbourne"],
  ["PER", "Perth Airport", "Perth", "Australia/Perth"], ["SYD", "Sydney Airport", "Sydney", "Australia/Sydney"],
]) points.push([`tf-point-au-${code.toLowerCase()}`, "AU", code, name, city, timezone, "International departures", "TRS facility after immigration", "combined", "Australian Border Force", "varies", "The TRS facility serves international departures. Present the goods, passport, boarding pass and tax invoices. Claim at least 30 minutes before scheduled flight departure.", 0, '["arrive_early","show_documents_goods","validation_before_payment"]', "keep_accessible", "tf-src-au-world"]);

points.push(
  ["tf-point-sg-chg-land", "SG", "SIN", "Singapore Changi Airport", "Singapore", "Asia/Singapore", "Departure Check-in Hall", "Designated GST refund area before check-in", "electronic_validation", "eTRS", "not_published", "Use this point before check-in for bulky goods or goods in checked baggage.", 1, '["before_checkin","show_documents_goods","validation_before_payment"]', "hold_before_checkin", "tf-src-sg-world"],
  ["tf-point-sg-chg-air", "SG", "SIN", "Singapore Changi Airport", "Singapore", "Asia/Singapore", "Departure Transit Lounge", "eTRS kiosks and GST Cash Refund counter after immigration", "combined", "eTRS", "not_published", "Use the transit-lounge route for hand-carried goods and cash refund when approved.", 0, '["hand_luggage_only","show_documents_goods","validation_before_payment"]', "hand_after_security", "tf-src-sg-world"],
  ["tf-point-sg-xsp", "SG", "XSP", "Seletar Airport", "Singapore", "Asia/Singapore", "Passenger Terminal", "eTRS self-help kiosk and inspection route", "combined", "eTRS", "not_published", "Credit-card and Alipay refund methods are available; follow the kiosk inspection result.", 1, '["arrive_early","show_documents_goods","validation_before_payment"]', "keep_accessible", "tf-src-sg-world"],
  ["tf-point-il-tlv3", "IL", "TLV", "Ben Gurion Airport", "Tel Aviv", "Asia/Jerusalem", "Terminal 3", "Wing E; use the landside desk first when goods cannot remain in hand baggage", "combined", "Milgam", "not_published", "Bring passport, goods, invoice and the dedicated refund document. Complete landside handling before security when the goods will be checked.", 1, '["before_checkin","show_documents_goods","validation_before_payment"]', "hold_before_checkin", "tf-src-il-world"],
  ["tf-point-il-tlv1", "IL", "TLV", "Ben Gurion Airport", "Tel Aviv", "Asia/Jerusalem", "Terminal 1", "Duty-free area VAT refund point", "refund", "Milgam", "not_published", "Use the terminal refund point with the approved-business documents and goods.", 0, '["show_documents_goods","validation_before_payment"]', "hand_after_security", "tf-src-il-world"],
  ["tf-point-il-etm", "IL", "ETM", "Ramon Airport", "Eilat", "Asia/Jerusalem", null, "VAT refund service point", "combined", "Milgam", "not_published", "Present the required tourist refund documents and goods before departure.", null, '["arrive_early","show_documents_goods"]', "keep_accessible", "tf-src-il-world"],
  ["tf-point-th-bkk", "TH", "BKK", "Suvarnabhumi Airport", "Bangkok", "Asia/Bangkok", "International departures", "Customs inspection before check-in; refund office after immigration", "combined", "Thailand Revenue Department", "not_published", "For claims requiring inspection, show goods, P.P.10 and invoices before check-in. High-value goods may need a second presentation after immigration.", 1, '["before_checkin","show_documents_goods","validation_before_payment"]', "hold_before_checkin", "tf-src-th-world"],
  ["tf-point-th-dmk", "TH", "DMK", "Don Mueang International Airport", "Bangkok", "Asia/Bangkok", "International departures", "VAT Refund for Tourists office", "combined", "Thailand Revenue Department", "not_published", "Follow airport signs; present the required form, invoices and goods when inspection is required.", 1, '["arrive_early","show_documents_goods","validation_before_payment"]', "keep_accessible", "tf-src-th-world"],
  ["tf-point-tw-tpe", "TW", "TPE", "Taiwan Taoyuan International Airport", "Taipei", "Asia/Taipei", "International departures", "E-VAT refund machine or tax refund service counter before baggage check-in", "combined", "Taiwan Tax Refund", "not_published", "Arrive early and complete any customs inspection before the goods become inaccessible.", 1, '["before_checkin","show_documents_goods","validation_before_payment"]', "hold_before_checkin", "tf-src-tw-world"],
  ["tf-point-ae-dxb", "AE", "DXB", "Dubai International Airport", "Dubai", "Asia/Dubai", "International departures", "Planet self-service kiosk or manned validation desk before baggage check-in", "combined", "Planet", "varies", "Validate tax-free transactions within the official departure window and present goods if inspection is requested.", 1, '["before_checkin","show_documents_goods","validation_before_payment"]', "hold_before_checkin", "tf-src-ae-world"],
  ["tf-point-ae-auh", "AE", "AUH", "Zayed International Airport", "Abu Dhabi", "Asia/Dubai", "International departures", "Planet self-service kiosk or manned validation desk before baggage check-in", "combined", "Planet", "varies", "Validate tax-free transactions within the official departure window and present goods if inspection is requested.", 1, '["before_checkin","show_documents_goods","validation_before_payment"]', "hold_before_checkin", "tf-src-ae-world"],
  ["tf-point-az-gyd", "AZ", "GYD", "Heydar Aliyev International Airport", "Baku", "Asia/Baku", "International departures", "Tax Free / VAT refund facility", "combined", null, "not_published", "Use the airport VAT refund route with passport, tax-free documents, receipts and goods.", 1, '["arrive_early","show_documents_goods","validation_before_payment"]', "keep_accessible", "tf-src-az-world"],
);

for (const point of points) {
  const [id, country, code, name, city, timezone, terminal, zone, service, operator, hoursStatus, details, beforeSecurity, instructions, baggage, sourceId] = point;
  const hoursJson = hoursStatus === "varies" ? '{"kind":"varies"}' : '{"kind":"not_published"}';
  output.push(`INSERT OR IGNORE INTO tax_free_departure_points (id,rule_version_id,location_type,location_code,location_name,city,timezone,terminal,zone,service_type,operator_name,hours_status,hours_json,location_details,before_security,instruction_codes_json,baggage_code,contact_json,map_url,source_id,content_verified_at,source_checked_at,active) VALUES (${sql(id)},${sql(`tf-${country.toLowerCase()}-world-v1`)},'airport',${sql(code)},${sql(name)},${sql(city)},${sql(timezone)},${terminal == null ? "NULL" : sql(terminal)},${sql(zone)},${sql(service)},${operator == null ? "NULL" : sql(operator)},${sql(hoursStatus)},${sql(hoursJson)},${sql(details)},${beforeSecurity == null ? "NULL" : beforeSecurity},${sql(instructions)},${sql(baggage)},NULL,NULL,${sql(sourceId)},${verifiedAt},${verifiedAt},1);`);
}

writeFileSync("migrations/0031_tax_free_world_directory.sql", `${output.join("\n\n")}\n`);
console.log(JSON.stringify({ countries: codes.length, partial: known.size, departurePoints: points.length }));
