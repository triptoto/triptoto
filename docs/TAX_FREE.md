# Tax Free reference maintenance

Tripto exposes the last **published and reviewed** Tax Free rule through
`GET /api/v1/tax-free/:country`. A refresh in the app only downloads this
published record. It never scrapes a government page from a traveler request.

## Worldwide scope

The directory has an explicit top-level record for all 249 ISO 3166-1 countries
and territories. Coverage and evidence depth are separate: a country is never
treated as unavailable only because research is incomplete.

The 2026-09-27 research resolution contains:

- 9 countries with reviewed available rules;
- 9 countries with a confirmed unavailable result;
- 54 countries with partial published evidence that still needs country-level
  legal and operational review;
- 177 countries and territories where a confirmed public tourist-refund program
  was not found in the reviewed sources.

All 249 top-level country and territory records now have a dated tax-system
profile in `tax_free_system_profiles` and a worldwide VAT/GST screening entry in
`tax_free_research_checks`. The profile records the tax system, published rate
summary, program search result, evidence level, source and review date. A worldwide screening is not a
country-level legal determination: records stay `unverified` until an official
tax, customs or legal source supports a conclusion. The UI says this explicitly
and never turns “no confirmed public program found” into “refund unavailable”.

Official authority profiles additionally cover Bermuda, Brunei, Canada, India,
Macao, Malaysia and Qatar. India remains partial because legislation mentions a
tourist refund but a current nationwide operational procedure has not been
confirmed. The other six have an official basis for the absence of a current
general tourist VAT/GST refund.

The reviewed core is:

- France: available, with PABLO procedure and French tax rates.
- Italy: available, with the OTELLO procedure.
- Japan: current rules plus the published reform effective 2026-11-01.
- United Kingdom: unavailable for carried goods in Great Britain, with a
  separate available regional rule for Northern Ireland.

The worldwide seed combines official authorities, the EU traveler VAT page and
published operator destination directories. Operator presence is only evidence
that a refund route is offered; it is not presented as a complete legal rule.
Exact operator fees are not seeded because no single verified fee applies to
every retailer or operator.

Official sources are stored per rule version in `tax_free_sources`; the user
interface links to those pages and keeps content verification, technical source
checking, and device download dates separate.

## Localized rule content

`GET /api/v1/tax-free/:country?locale=<en|de|es|fr|ru>` returns the rule body in
the requested language when a reviewed translation exists, and otherwise falls
back to the base English value field by field. Translations live in
`tax_free_rule_translations` keyed by `(rule_version_id, locale, field_key)`.
`field_key` uses the serialized camelCase rule keys: `programName`, `summary`,
`disclaimer` hold plain text; `eligibility`, `purchases`, `storeSteps`,
`documents`, `goods`, `deadlines`, `customsValidation`, `electronicValidation`
and `payout` hold a JSON string matching the base field's shape. Only these keys
are overlaid; anything else is ignored. Section headings, status labels and
airport instruction codes are localized in the client copy tables, not the API.
Seed translations through the same reviewed migration workflow as the rule
itself — never machine-translate legal content into a published version.

Airport guidance is stored separately in `tax_free_departure_points`. The UI
separates customs or electronic validation from operator payment and shows the
terminal, zone, security side, baggage order, contact and official source. A
schedule is explicitly classified as published, flight-relative, variable, not
published or not required; terminal opening hours are never substituted for an
unpublished desk schedule. The directory currently contains 35 service points
across 27 airports. Detailed reviewed guidance covers FCO, MXP, VCE, CDG, ORY,
NRT and HND; additional partial records cover selected airports in Australia,
Singapore, Israel, Thailand, Taiwan, the UAE and Azerbaijan. Airports from the
active trip are selected first. Missing exact airport details are shown as
pending research, never as proof that service is unavailable.

## Safe source checks

Scheduled checking is disabled by default:

```text
TAX_FREE_SOURCE_CHECKS_ENABLED=false
TAX_FREE_SOURCE_CHECK_BUDGET=4
TAX_FREE_SOURCE_TIMEOUT_MS=8000
TAX_FREE_SOURCE_MAX_BYTES=750000
```

Only explicit HTTPS hosts in `apps/worker/src/tax-free-monitor.ts` are allowed.
Redirect targets are revalidated, response size and time are bounded, and page
code is never executed. ETag and Last-Modified are used when available. A
content change creates a `tax_free_change_candidates` entry and never changes a
published rule.

## Review and publication

All internal endpoints require normal account authentication, `OPS_ENABLED`,
and a matching `x-tripto-ops-secret`. Keep `OPS_SECRET` in Wrangler secrets.

1. Review candidates with `GET /api/v1/internal/tax-free/candidates`.
2. Mark a candidate accepted or dismissed through
   `POST /api/v1/internal/tax-free/candidates/:id/review`.
3. Create or edit a new rule version through a reviewed SQL migration. Keep the
   old published version intact, set `lifecycle='draft'`, record
   `supersedes_version_id`, add its rates, thresholds, sources, translations,
   and evidence dates, and run the migration against preview first.
4. Publish the reviewed draft through
   `POST /api/v1/internal/tax-free/drafts/:id/publish`. The explicitly
   superseded version is retired in the same D1 batch.
5. Roll back through
   `POST /api/v1/internal/tax-free/versions/:id/rollback`.

The reviewed rule seed is `migrations/0029_tax_free_rules.sql`, the initial
departure directory is `migrations/0030_tax_free_departure_points.sql`, and the
world directory is `migrations/0031_tax_free_world_directory.sql`, and the dated
research ledger plus reviewed expansion is
`migrations/0032_tax_free_research_expansion.sql`. Regenerate them deterministically
with `node scripts/generate-tax-free-world.mjs` and
`node scripts/generate-tax-free-research.mjs`.
Production deploys do not apply D1 migrations automatically. Apply and validate
the migration separately before deploying the Worker.

## Validation checklist

- Confirm eligibility, tax rates, purchase threshold basis, deadlines, customs
  validation, payout responsibility, and regional exceptions independently.
- Use government tax/customs sources first. Use an operator source only for the
  operator's own fee, locations, timing, and payment process.
- Paraphrase source facts and retain the URL, publisher, claim scope, content
  verification date, technical check date, and effective date.
- If sources conflict or cannot be reached, publish `partial`, `unverified`, or
  `recheck`; do not infer a negative program status.
- Run `npm run typecheck`, `npm run check:i18n`,
  `node tests/tax-free.contract.mjs`, the local D1 migration, and the public API
  scenario checks before release.
