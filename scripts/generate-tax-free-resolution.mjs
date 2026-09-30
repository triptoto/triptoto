import { readFileSync, writeFileSync } from "node:fs";

const input = JSON.parse(readFileSync("scripts/data/tax-free-vat-profiles.json", "utf8"));
const checkedAt = 1790467200000;
const nextReviewAt = 1806278400000;
const q = value => value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;

const official = {
  BM:{programStatus:"confirmed_unavailable",evidenceLevel:"official_authority",sourceUrl:"https://www3.gov.bm/taxes-business-bermuda",sourcePublisher:"Government of Bermuda",taxSystemStatus:"no_general_vat_or_sales_tax",rateSummary:"No general VAT or sales tax",finding:"The government tax directory does not impose a general VAT or sales tax, so there is no general tourist VAT/GST refund."},
  BN:{programStatus:"confirmed_unavailable",evidenceLevel:"official_authority",sourceUrl:"https://www.mfa.gov.bn/japan-tokyo/SitePages/businessinbrunei.aspx",sourcePublisher:"Government of Brunei Darussalam",taxSystemStatus:"no_general_sales_tax",rateSummary:"No sales tax",finding:"The official government business guide states that Brunei has no sales tax, so there is no general tourist sales-tax refund."},
  CA:{programStatus:"confirmed_unavailable",evidenceLevel:"official_authority",sourceUrl:"https://budget.canada.ca/2007/plan/bpa5a-eng.html",sourcePublisher:"Government of Canada",taxSystemStatus:"gst_hst",rateSummary:"GST/HST applies",finding:"Canada eliminated the general Visitor Rebate Program effective 1 April 2007. A narrower convention and tour incentive program is separate."},
  IN:{programStatus:"published_partial",evidenceLevel:"official_authority",sourceUrl:"https://cbic-gst.gov.in/hindi/IGST-bill-e.html",sourcePublisher:"Central Board of Indirect Taxes and Customs",taxSystemStatus:"gst",rateSummary:"GST applies",finding:"The IGST legislation provides for a refund to international tourists subject to prescribed conditions, but a current nationwide operational traveler procedure is not confirmed."},
  MO:{programStatus:"confirmed_unavailable",evidenceLevel:"official_authority",sourceUrl:"https://www.gov.mo/en/browse/taxation/",sourcePublisher:"Macao SAR Government",taxSystemStatus:"no_general_vat",rateSummary:"No general VAT",finding:"The official taxation directory lists specific taxes but no general VAT/GST, so there is no general tourist VAT refund."},
  MY:{programStatus:"confirmed_unavailable",evidenceLevel:"official_authority",sourceUrl:"https://www.mof.gov.my/portal/en/news/press-citations/fiscal-reform-to-continue-drawing-up-medium-term-revenue-strategy-mof",sourcePublisher:"Ministry of Finance Malaysia",taxSystemStatus:"sales_and_service_tax",rateSummary:"SST replaced GST",finding:"Malaysia abolished GST and reintroduced SST in 2018. The former GST tourist refund scheme is therefore not a current general VAT/GST refund."},
  QA:{programStatus:"confirmed_unavailable",evidenceLevel:"official_authority",sourceUrl:"https://gta.gov.qa/en/investors-guide",sourcePublisher:"Qatar General Tax Authority",taxSystemStatus:"vat_not_applied",rateSummary:"VAT not applied",finding:"The General Tax Authority states that Qatar has not applied VAT, so there is no general tourist VAT refund."},
};

const out = [
  "-- Complete research-resolution ledger for every Tax Free territory.",
  "-- A no-confirmed-program result records the completed search; it is not a legal claim of unavailability.",
  `CREATE TABLE IF NOT EXISTS tax_free_system_profiles (
    territory_id TEXT PRIMARY KEY REFERENCES tax_free_territories(id) ON DELETE CASCADE,
    tax_system_status TEXT NOT NULL,
    rate_summary TEXT,
    program_status TEXT NOT NULL CHECK (program_status IN ('confirmed_available','confirmed_unavailable','published_partial','no_confirmed_program_found')),
    evidence_level TEXT NOT NULL CHECK (evidence_level IN ('official_authority','published_rule','published_partial','cross_source_screening')),
    finding_summary TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_publisher TEXT NOT NULL,
    source_reviewed_on TEXT,
    checked_at INTEGER NOT NULL,
    next_review_at INTEGER
  );`,
  "CREATE INDEX IF NOT EXISTS idx_tax_free_profiles_status ON tax_free_system_profiles(program_status,evidence_level);",
];

for (const base of input.profiles) {
  const override = official[base.countryCode] || {};
  const profile = {...base,...override};
  if (profile.evidenceLevel === "reviewed_rule") profile.evidenceLevel = "published_rule";
  const territory = `tf-${base.countryCode.toLowerCase()}`;
  const sourceUrl = profile.sourceUrl || input.source.url;
  const sourcePublisher = profile.sourcePublisher || input.source.publisher;
  const finding = profile.finding || (profile.programStatus === "confirmed_available"
    ? "A published traveler refund rule is available in Tripto."
    : profile.programStatus === "confirmed_unavailable"
      ? "A published source confirms that a general tourist VAT/GST refund is unavailable."
      : profile.programStatus === "published_partial"
        ? "Evidence of a traveler refund route was found, but operational details are incomplete."
        : "The reviewed worldwide tax source did not establish a current tourist refund program. This is a research result, not proof of legal unavailability.");
  out.push(`INSERT OR REPLACE INTO tax_free_system_profiles (territory_id,tax_system_status,rate_summary,program_status,evidence_level,finding_summary,source_url,source_publisher,source_reviewed_on,checked_at,next_review_at) VALUES (${q(territory)},${q(profile.taxSystemStatus)},${q(profile.rateSummary)},${q(profile.programStatus)},${q(profile.evidenceLevel)},${q(finding)},${q(sourceUrl)},${q(sourcePublisher)},${q(profile.sourceReviewedOn || input.generatedOn)},${checkedAt},${nextReviewAt});`);
}

writeFileSync("migrations/0033_tax_free_system_profiles.sql", `${out.join("\n\n")}\n`);
console.log(JSON.stringify({profiles:input.profiles.length,officialOverrides:Object.keys(official).length}));
