import type { AuthContext, D1PreparedStatement, Env } from '../types.ts';
import { HttpError, json, readJson } from '../http.ts';

type Row = Record<string, unknown>;
const COUNTRY = /^[A-Z]{2}$/;
const REGION = /^[A-Z]{2}-[A-Z0-9]{1,6}$/;
const LOCALES = new Set(['en','de','es','fr','ru']);

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== 'string') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Rules take effect on the traveler's local date, not the UTC date; Cloudflare
// supplies the client's timezone. Falls back to UTC.
function today(request?: Request): string {
  const zone = (request as { cf?: { timezone?: unknown } } | undefined)?.cf?.timezone;
  if (typeof zone === 'string' && zone) {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { /* unknown zone */ }
  }
  return new Date().toISOString().slice(0, 10);
}

function coverageFromRows(rows: Row[], research: Row[] = [], profiles: Row[] = []): Record<string, number> {
  const top = rows.filter((row) => !row.region_code);
  const count = (status: string) => top.filter((row) => String(row.status) === status).length;
  const verifiedAvailable = count('verified_available');
  const verifiedUnavailable = count('verified_unavailable');
  const partial = count('partial');
  const recheck = count('recheck');
  const unverified = count('unverified');
  const researchChecked = new Set(research.map((row) => String(row.territory_id || '')).filter(Boolean)).size;
  const authorityReviewed = new Set(research.filter((row) => String(row.result).startsWith('official_')).map((row) => String(row.territory_id || '')).filter(Boolean)).size;
  const resolvedProfiles = new Set(profiles.map((row) => String(row.territory_id || '')).filter(Boolean)).size;
  const noConfirmedProgram = profiles.filter((row) => String(row.program_status) === 'no_confirmed_program_found').length;
  const officialProfiles = profiles.filter((row) => String(row.evidence_level) === 'official_authority').length;
  return {
    totalCountries: top.length,
    verifiedAvailable,
    verifiedUnavailable,
    partial,
    recheck,
    unverified,
    publishedEvidence: verifiedAvailable + verifiedUnavailable + partial + recheck,
    researchChecked,
    authorityReviewed,
    resolvedProfiles,
    noConfirmedProgram,
    officialProfiles,
  };
}

async function coverageSummary(env: Env): Promise<Record<string, number>> {
  const [territories, research, profiles] = await env.DB.batch([
    env.DB.prepare(`SELECT id,country_code,region_code,status FROM tax_free_territories`),
    env.DB.prepare(`SELECT territory_id,result FROM tax_free_research_checks`),
    env.DB.prepare(`SELECT territory_id,program_status,evidence_level FROM tax_free_system_profiles`),
  ]);
  return coverageFromRows((territories.results || []) as Row[], (research.results || []) as Row[], (profiles.results || []) as Row[]);
}

async function territoryProfile(env: Env, territoryId: string): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(`SELECT tax_system_status,rate_summary,program_status,evidence_level,finding_summary,source_url,source_publisher,source_reviewed_on,checked_at,next_review_at FROM tax_free_system_profiles WHERE territory_id=?`).bind(territoryId).first<Row>();
  return row ? {
    taxSystemStatus:row.tax_system_status,rateSummary:text(row.rate_summary),programStatus:row.program_status,
    evidenceLevel:row.evidence_level,findingSummary:row.finding_summary,sourceUrl:row.source_url,
    sourcePublisher:row.source_publisher,sourceReviewedOn:text(row.source_reviewed_on),checkedAt:num(row.checked_at),nextReviewAt:num(row.next_review_at),
  } : null;
}

async function countryGuide(env: Env, countryCode: string): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(`SELECT iso2,iso3,destination,refund_status,tax_type,standard_tax_rate,minimum_purchase,
    eligibility,eligible_purchases,excluded_purchases,export_deadline,at_purchase,departure_process,refund_method_fees,
    future_change,traveler_summary,source_quality,source_url_primary,source_url_secondary,last_verified_at,confidence,
    manual_review_required,app_display_policy,status_label,data_version,stale_after_days,refresh_before_trip
    FROM tax_refund_country_guides WHERE iso2=?`).bind(countryCode).first<Row>();
  return row ? {
    iso2:row.iso2,iso3:row.iso3,destination:row.destination,refundStatus:row.refund_status,
    taxType:text(row.tax_type),standardTaxRate:text(row.standard_tax_rate),minimumPurchase:text(row.minimum_purchase),
    eligibility:row.eligibility,eligiblePurchases:text(row.eligible_purchases),excludedPurchases:text(row.excluded_purchases),
    exportDeadline:text(row.export_deadline),atPurchase:row.at_purchase,departureProcess:row.departure_process,
    refundMethodFees:text(row.refund_method_fees),futureChange:text(row.future_change),travelerSummary:row.traveler_summary,
    sourceQuality:row.source_quality,sourceUrlPrimary:row.source_url_primary,sourceUrlSecondary:text(row.source_url_secondary),
    lastVerifiedAt:row.last_verified_at,confidence:row.confidence,manualReviewRequired:row.manual_review_required,
    appDisplayPolicy:row.app_display_policy,statusLabel:row.status_label,dataVersion:row.data_version,
    staleAfterDays:num(row.stale_after_days),refreshBeforeTrip:row.refresh_before_trip,
  } : null;
}

async function territoryResearch(env: Env, territoryId: string): Promise<Record<string, unknown>[]> {
  const rows = (await env.DB.prepare(`SELECT result,source_url,publisher,source_kind,finding_summary,checked_at,next_review_at
    FROM tax_free_research_checks WHERE territory_id=? ORDER BY CASE WHEN result LIKE 'official_%' THEN 0 ELSE 1 END,checked_at DESC,publisher`).bind(territoryId).all<Row>()).results || [];
  return (rows as Row[]).map((row) => ({
    result:row.result,sourceUrl:row.source_url,publisher:row.publisher,sourceKind:row.source_kind,
    findingSummary:row.finding_summary,checkedAt:num(row.checked_at),nextReviewAt:num(row.next_review_at),
  }));
}

async function ruleChildren(env: Env, versionId: string): Promise<Record<string, unknown>> {
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(`SELECT category,rate,price_includes_tax,notes FROM tax_free_rates WHERE rule_version_id=? ORDER BY rate DESC`).bind(versionId),
    env.DB.prepare(`SELECT label,amount,maximum_amount,currency,basis,comparison,notes FROM tax_free_thresholds WHERE rule_version_id=? ORDER BY amount`).bind(versionId),
    env.DB.prepare(`SELECT name,methods_json,fee_json,timing,notes FROM tax_free_operators WHERE rule_version_id=? ORDER BY name`).bind(versionId),
    env.DB.prepare(`SELECT exit_type,location_name,title,instructions_json,baggage_note FROM tax_free_exit_instructions WHERE rule_version_id=? ORDER BY id`).bind(versionId),
    env.DB.prepare(`SELECT p.location_type,p.location_code,p.location_name,p.city,p.timezone,p.terminal,p.zone,p.service_type,p.operator_name,
      p.hours_status,p.hours_json,p.location_details,p.before_security,p.instruction_codes_json,p.baggage_code,p.contact_json,p.map_url,
      p.content_verified_at,p.source_checked_at,s.url source_url,s.publisher source_publisher
      FROM tax_free_departure_points p LEFT JOIN tax_free_sources s ON s.id=p.source_id
      WHERE p.rule_version_id=? AND p.active=1 ORDER BY p.location_name,p.terminal,p.id`).bind(versionId),
    env.DB.prepare(`SELECT url,host,publisher,source_type,claim_scope,effective_from,checked_at,last_technical_check_at FROM tax_free_sources WHERE rule_version_id=? AND active=1 ORDER BY publisher,url`).bind(versionId),
  ];
  const [rates, thresholds, operators, exits, departurePoints, sources] = await env.DB.batch(statements);
  return {
    rates: ((rates.results || []) as Row[]).map((r) => ({ category:r.category, rate:num(r.rate), priceIncludesTax:Number(r.price_includes_tax)===1, notes:text(r.notes) })),
    thresholds: ((thresholds.results || []) as Row[]).map((r) => ({ label:r.label, amount:num(r.amount), maximumAmount:num(r.maximum_amount), currency:r.currency, basis:r.basis, comparison:r.comparison, notes:text(r.notes) })),
    operators: ((operators.results || []) as Row[]).map((r) => ({ name:r.name, methods:parseJson(r.methods_json,[]), fee:parseJson(r.fee_json,null), timing:text(r.timing), notes:text(r.notes) })),
    exitInstructions: ((exits.results || []) as Row[]).map((r) => ({ exitType:r.exit_type, locationName:text(r.location_name), title:r.title, instructions:parseJson(r.instructions_json,[]), baggageNote:text(r.baggage_note) })),
    departurePoints: ((departurePoints.results || []) as Row[]).map((r) => ({
      locationType:r.location_type,locationCode:text(r.location_code),locationName:r.location_name,city:text(r.city),timezone:text(r.timezone),
      terminal:text(r.terminal),zone:text(r.zone),serviceType:r.service_type,operatorName:text(r.operator_name),hoursStatus:r.hours_status,
      hours:parseJson(r.hours_json,{}),locationDetails:r.location_details,beforeSecurity:r.before_security==null?null:Number(r.before_security)===1,
      instructionCodes:parseJson(r.instruction_codes_json,[]),baggageCode:text(r.baggage_code),contact:parseJson(r.contact_json,null),mapUrl:text(r.map_url),
      contentVerifiedAt:num(r.content_verified_at),sourceCheckedAt:num(r.source_checked_at),sourceUrl:text(r.source_url),sourcePublisher:text(r.source_publisher),
    })),
    sources: ((sources.results || []) as Row[]).map((r) => ({ url:r.url, host:r.host, publisher:r.publisher, type:r.source_type, claimScope:r.claim_scope, effectiveFrom:text(r.effective_from), contentCheckedAt:num(r.checked_at), technicalCheckedAt:num(r.last_technical_check_at) })),
  };
}

function serializeRule(row: Row, children: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    version: Number(row.version_number),
    availability: row.availability,
    programName: row.program_name,
    summary: row.summary,
    eligibility: parseJson(row.eligibility_json, []),
    purchases: parseJson(row.purchases_json, []),
    storeSteps: parseJson(row.store_steps_json, []),
    documents: parseJson(row.documents_json, []),
    goods: parseJson(row.goods_json, []),
    deadlines: parseJson(row.deadlines_json, {}),
    customsValidation: parseJson(row.customs_json, []),
    electronicValidation: parseJson(row.electronic_validation_json, []),
    payout: parseJson(row.payout_json, []),
    disclaimer: row.disclaimer,
    effectiveFrom: row.effective_from,
    effectiveTo: text(row.effective_to),
    contentVerifiedAt: num(row.content_verified_at),
    sourceCheckedAt: num(row.source_checked_at),
    publishedAt: num(row.published_at),
    ...children,
  };
}

// Rule body fields that can carry a reviewed per-locale translation. Stored in
// tax_free_rule_translations by camelCase field_key: plain text for string
// fields, a JSON string for the array/object fields. Anything without a reviewed
// translation falls back to the base (English) value.
const TRANSLATABLE_RULE_FIELDS = new Set([
  'programName','summary','disclaimer',
  'eligibility','purchases','storeSteps','documents','goods','deadlines',
  'customsValidation','electronicValidation','payout',
]);

async function localizeRule(env: Env, versionId: string, locale: string, rule: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  if (!rule || locale === 'en') return rule;
  const rows = (await env.DB.prepare(`SELECT field_key,value FROM tax_free_rule_translations WHERE rule_version_id=? AND locale=?`).bind(versionId, locale).all<Row>()).results || [];
  if (!rows.length) return rule;
  const localized = { ...rule };
  for (const r of rows as Row[]) {
    const key = String(r.field_key);
    if (!TRANSLATABLE_RULE_FIELDS.has(key)) continue;
    const base = localized[key];
    localized[key] = (Array.isArray(base) || (base != null && typeof base === 'object'))
      ? parseJson(r.value, base)
      : (text(r.value) ?? base);
  }
  return localized;
}

async function publishedRule(env: Env, territoryId: string, onDate: string): Promise<Row | null> {
  return env.DB.prepare(`SELECT * FROM tax_free_rule_versions
    WHERE territory_id=? AND lifecycle='published' AND effective_from<=?
      AND (effective_to IS NULL OR effective_to>=?)
    ORDER BY effective_from DESC,version_number DESC LIMIT 1`).bind(territoryId,onDate,onDate).first<Row>();
}

async function upcomingRule(env: Env, territoryId: string, onDate: string): Promise<Row | null> {
  return env.DB.prepare(`SELECT * FROM tax_free_rule_versions
    WHERE territory_id=? AND lifecycle='published' AND effective_from>?
    ORDER BY effective_from ASC,version_number ASC LIMIT 1`).bind(territoryId,onDate).first<Row>();
}

export async function taxFreeCatalog(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const wanted = [...new Set(String(url.searchParams.get('countries') || '').split(',').map(v=>v.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length > 25 || wanted.some(code=>!COUNTRY.test(code))) throw new HttpError(400,'VALIDATION_ERROR','countries must contain up to 25 two-letter country codes.');
  const rows = (await env.DB.prepare(`SELECT id,country_code,region_code,name,parent_id,status,regional_note,updated_at
    FROM tax_free_territories ORDER BY country_code,region_code`).all<Row>()).results || [];
  const [researchResult, profileResult] = await env.DB.batch([
    env.DB.prepare(`SELECT territory_id,result FROM tax_free_research_checks`),
    env.DB.prepare(`SELECT territory_id,program_status,evidence_level FROM tax_free_system_profiles`),
  ]);
  const researchRows = researchResult.results || [];
  const profileRows = profileResult.results || [];
  const selected = wanted.length ? rows.filter(row=>wanted.includes(String(row.country_code))) : rows;
  const onDate = today(request);
  // Resolve the current and upcoming published version for every territory in two
  // grouped window queries instead of two per territory (which fanned out to ~500
  // D1 subrequests for the full directory).
  const [currentBatch, upcomingBatch] = await env.DB.batch([
    env.DB.prepare(`SELECT territory_id,version_number,effective_from FROM (
      SELECT territory_id,version_number,effective_from,
        ROW_NUMBER() OVER (PARTITION BY territory_id ORDER BY effective_from DESC,version_number DESC) rn
      FROM tax_free_rule_versions
      WHERE lifecycle='published' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
    ) WHERE rn=1`).bind(onDate,onDate),
    env.DB.prepare(`SELECT territory_id,version_number,effective_from FROM (
      SELECT territory_id,version_number,effective_from,
        ROW_NUMBER() OVER (PARTITION BY territory_id ORDER BY effective_from ASC,version_number ASC) rn
      FROM tax_free_rule_versions
      WHERE lifecycle='published' AND effective_from>?
    ) WHERE rn=1`).bind(onDate),
  ]);
  const currentByTerritory = new Map(((currentBatch.results||[]) as Row[]).map(r=>[String(r.territory_id),r]));
  const upcomingByTerritory = new Map(((upcomingBatch.results||[]) as Row[]).map(r=>[String(r.territory_id),r]));
  const territories = selected.map(row => {
    const rule = currentByTerritory.get(String(row.id));
    const future = upcomingByTerritory.get(String(row.id));
    return {
      id:row.id,countryCode:row.country_code,regionCode:text(row.region_code),name:row.name,parentId:text(row.parent_id),
      status:row.status,regionalNote:text(row.regional_note),updatedAt:num(row.updated_at),
      currentVersion:rule ? Number(rule.version_number) : null,currentEffectiveFrom:rule?.effective_from || null,
      upcomingVersion:future ? Number(future.version_number) : null,upcomingEffectiveFrom:future?.effective_from || null,
    };
  });
  const version = Math.max(0,...territories.map(t=>Number(t.updatedAt)||0));
  const coverage = coverageFromRows(rows, researchRows as Row[], profileRows as Row[]);
  return json({ taxFree:{ datasetVersion:String(version), generatedAt:Date.now(), verifiedCountries:coverage.verifiedAvailable+coverage.verifiedUnavailable, coverage, territories } }, { headers:{ etag:`W/\"tax-free-${version}\"` } }, request, env);
}

export async function taxFreeRule(request: Request, env: Env, countryCode: string): Promise<Response> {
  const country = countryCode.toUpperCase();
  if (!COUNTRY.test(country)) throw new HttpError(400,'VALIDATION_ERROR','country must be a two-letter country code.');
  const url = new URL(request.url);
  const region = String(url.searchParams.get('region') || '').trim().toUpperCase();
  if (region && !REGION.test(region)) throw new HttpError(400,'VALIDATION_ERROR','region must be an ISO-style region code.');
  const locale = LOCALES.has(String(url.searchParams.get('locale')||'')) ? String(url.searchParams.get('locale')) : 'en';
  const territory = region
    ? await env.DB.prepare(`SELECT * FROM tax_free_territories WHERE country_code=? AND region_code=?`).bind(country,region).first<Row>()
    : await env.DB.prepare(`SELECT * FROM tax_free_territories WHERE country_code=? AND region_code IS NULL`).bind(country).first<Row>();
  const coverage = await coverageSummary(env);
  if (!territory) {
    return json({ taxFree:{ countryCode:country,regionCode:region||null,name:country,status:'unverified',regionalNote:null,rule:null,upcomingRule:null,research:[],coverage,locale,loadedAt:Date.now() } },{},request,env);
  }
  const onDate = today(request);
  const current = await publishedRule(env,String(territory.id),onDate);
  const future = await upcomingRule(env,String(territory.id),onDate);
  const regions = (await env.DB.prepare(`SELECT region_code,name,status,regional_note FROM tax_free_territories WHERE country_code=? AND region_code IS NOT NULL ORDER BY name`).bind(country).all<Row>()).results || [];
  const currentData = current ? await localizeRule(env,String(current.id),locale,serializeRule(current,await ruleChildren(env,String(current.id)))) : null;
  const futureData = future ? await localizeRule(env,String(future.id),locale,serializeRule(future,await ruleChildren(env,String(future.id)))) : null;
  const [research, systemProfile, guide] = await Promise.all([
    territoryResearch(env,String(territory.id)), territoryProfile(env,String(territory.id)), countryGuide(env,country),
  ]);
  const version = current ? `${territory.id}-v${current.version_number}` : `${territory.id}-none`;
  return json({ taxFree:{
    countryCode:country,regionCode:text(territory.region_code),name:territory.name,status:territory.status,
    regionalNote:text(territory.regional_note),regions:regions.map(r=>({regionCode:r.region_code,name:r.name,status:r.status,regionalNote:text(r.regional_note)})),
    rule:currentData,upcomingRule:futureData,research,systemProfile,guide,coverage,locale,datasetVersion:guide?.dataVersion||version,loadedAt:Date.now(),
  }},{headers:{etag:`W/\"${version}\"`}},request,env);
}

async function requireOps(request: Request, env: Env): Promise<void> {
  if (env.OPS_ENABLED !== 'true') throw new HttpError(404,'NOT_FOUND','Endpoint not found.');
  const supplied = request.headers.get('x-tripto-ops-secret') || '';
  if (!env.OPS_SECRET || env.OPS_SECRET.length < 20 || !supplied) throw new HttpError(404,'NOT_FOUND','Endpoint not found.');
  const enc = new TextEncoder();
  const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(supplied)),crypto.subtle.digest('SHA-256',enc.encode(env.OPS_SECRET))]);
  const aa=new Uint8Array(a),bb=new Uint8Array(b); let diff=aa.length===bb.length?0:1;
  for(let i=0;i<Math.min(aa.length,bb.length);i++)diff|=aa[i]^bb[i];
  if(diff) throw new HttpError(404,'NOT_FOUND','Endpoint not found.');
}

export async function taxFreeCandidates(request: Request, env: Env, _auth: AuthContext): Promise<Response> {
  await requireOps(request,env);
  const candidates=(await env.DB.prepare(`SELECT c.*,s.url,s.publisher,s.claim_scope FROM tax_free_change_candidates c JOIN tax_free_sources s ON s.id=c.source_id ORDER BY c.detected_at DESC LIMIT 100`).all()).results||[];
  return json({candidates},{},request,env);
}

export async function reviewTaxFreeCandidate(request: Request, env: Env, auth: AuthContext, id: string): Promise<Response> {
  await requireOps(request,env);
  const body=await readJson<{action?:unknown;note?:unknown}>(request,8*1024);
  const action=String(body.action||'');
  if(!['accepted','dismissed'].includes(action))throw new HttpError(400,'VALIDATION_ERROR','action must be accepted or dismissed.');
  const note=typeof body.note==='string'?body.note.trim().slice(0,1000):null;
  const result=await env.DB.prepare(`UPDATE tax_free_change_candidates SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE id=? AND status='pending'`).bind(action,Date.now(),auth.userId||auth.deviceId,note,id).run();
  if(!result.success)throw new HttpError(500,'UPDATE_FAILED','The candidate could not be reviewed.');
  if(Number(result.meta?.changes??0)<1)throw new HttpError(409,'CANDIDATE_ALREADY_REVIEWED','The candidate was already reviewed or does not exist.');
  return json({candidate:{id,status:action},note:'Accepting a source change never publishes traveler-facing rules.'},{},request,env);
}

export async function publishTaxFreeDraft(request: Request, env: Env, auth: AuthContext, id: string): Promise<Response> {
  await requireOps(request,env);
  const row=await env.DB.prepare(`SELECT id,territory_id,version_number,lifecycle,supersedes_version_id FROM tax_free_rule_versions WHERE id=?`).bind(id).first<Row>();
  if(!row)throw new HttpError(404,'NOT_FOUND','Draft not found.');
  if(row.lifecycle!=='draft')throw new HttpError(409,'NOT_A_DRAFT','Only a reviewed draft can be published.');
  const now=Date.now(),actor=auth.userId||auth.deviceId;
  const statements:D1PreparedStatement[]=[];
  if(row.supersedes_version_id){
    statements.push(env.DB.prepare(`UPDATE tax_free_rule_versions SET lifecycle='retired',updated_at=? WHERE id=? AND territory_id=? AND lifecycle='published'`).bind(now,row.supersedes_version_id,row.territory_id));
  }
  statements.push(
    env.DB.prepare(`UPDATE tax_free_rule_versions SET lifecycle='published',published_at=?,published_by=?,updated_at=? WHERE id=? AND lifecycle='draft'`).bind(now,actor,now,id),
    env.DB.prepare(`UPDATE tax_free_territories SET updated_at=? WHERE id=?`).bind(now,row.territory_id),
    env.DB.prepare(`INSERT INTO tax_free_publication_history(id,territory_id,rule_version_id,action,actor,notes,created_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),row.territory_id,id,'publish',actor,'Reviewed draft publication',now),
  );
  await env.DB.batch(statements);
  return json({published:{id,version:Number(row.version_number),publishedAt:now}},{},request,env);
}

export async function rollbackTaxFreeVersion(request: Request, env: Env, auth: AuthContext, id: string): Promise<Response> {
  await requireOps(request,env);
  const row=await env.DB.prepare(`SELECT id,territory_id,version_number,lifecycle FROM tax_free_rule_versions WHERE id=?`).bind(id).first<Row>();
  if(!row||row.lifecycle!=='published')throw new HttpError(404,'NOT_FOUND','Published version not found.');
  const previous=await env.DB.prepare(`SELECT id FROM tax_free_rule_versions WHERE territory_id=? AND lifecycle='retired' AND version_number<? ORDER BY version_number DESC LIMIT 1`).bind(row.territory_id,row.version_number).first<Row>();
  if(!previous)throw new HttpError(409,'NO_ROLLBACK_TARGET','No earlier reviewed version is available.');
  const now=Date.now(),actor=auth.userId||auth.deviceId;
  await env.DB.batch([
    env.DB.prepare(`UPDATE tax_free_rule_versions SET lifecycle='retired',updated_at=? WHERE id=?`).bind(now,id),
    env.DB.prepare(`UPDATE tax_free_rule_versions SET lifecycle='published',published_at=?,published_by=?,updated_at=? WHERE id=?`).bind(now,actor,now,previous.id),
    env.DB.prepare(`UPDATE tax_free_territories SET updated_at=? WHERE id=?`).bind(now,row.territory_id),
    env.DB.prepare(`INSERT INTO tax_free_publication_history(id,territory_id,rule_version_id,action,actor,notes,created_at) VALUES(?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),row.territory_id,previous.id,'rollback',actor,`Rollback from ${id}`,now),
  ]);
  return json({rolledBack:{from:id,to:previous.id,at:now}},{},request,env);
}
