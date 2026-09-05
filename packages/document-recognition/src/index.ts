export const SMART_IMPORT_MAX_BYTES = 10 * 1024 * 1024;

export const supportedDocumentKinds = ['pdf','image','text','eml','docx','ics','pkpass'] as const;
export type DocumentKind = typeof supportedDocumentKinds[number];
export const bookingTypes = ['flight','hotel','train','car','transfer','ferry','activity','restaurant','reservation','generic_ticket'] as const;
export type BookingType = typeof bookingTypes[number];
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'unavailable';
export type FieldSource = 'embedded_text' | 'ocr' | 'barcode' | 'calendar' | 'wallet' | 'email' | 'filename';

export interface DocumentInput {
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
}

export interface ExtractedField<T = string | number | null> {
  value: T;
  confidence: number;
  source: FieldSource;
}

export interface RecognitionEvidence {
  source: FieldSource;
  text: string;
}

export interface RecognitionCandidate {
  type: BookingType;
  confidence: number;
  fields: Record<string, ExtractedField>;
  warnings: string[];
  evidence: RecognitionEvidence[];
}

export interface RecognitionResult {
  kind: DocumentKind;
  checksum: string;
  candidates: RecognitionCandidate[];
  warnings: string[];
  privacy: { rawBytesUploaded: false; extractedTextPersisted: false };
}

export interface TextExtraction {
  text: string;
  source: FieldSource;
  warnings?: string[];
}

export interface BarcodeExtraction {
  value: string;
  format?: string;
}

export interface DocumentExtractionAdapter {
  extractText(input: DocumentInput, kind: DocumentKind): Promise<TextExtraction[]>;
  extractBarcodes(input: DocumentInput, kind: DocumentKind): Promise<BarcodeExtraction[]>;
}

export interface DocumentRecognitionProvider {
  readonly id: string;
  recognize(input: DocumentInput): Promise<RecognitionResult>;
}

/** Reserved extension boundary. It intentionally cannot be used while AI is disabled. */
export class AIDocumentRecognitionProvider implements DocumentRecognitionProvider {
  readonly id = 'ai-disabled';
  async recognize(_input: DocumentInput): Promise<RecognitionResult> {
    throw new Error('AI document recognition is disabled.');
  }
}

export class LocalDocumentRecognitionProvider implements DocumentRecognitionProvider {
  readonly id = 'local-deterministic-v1';
  constructor(private readonly adapter: DocumentExtractionAdapter) {}

  async recognize(input: DocumentInput): Promise<RecognitionResult> {
    validateDocumentInput(input);
    const kind = detectDocumentKind(input);
    // Text extraction is the recognition path that matters; barcode reading is
    // supplementary. On mobile Safari, rendering PDF pages to a canvas for
    // barcode scanning can fail (memory/canvas limits) — that must never reject
    // the whole recognition and strand a perfectly text-readable booking. Each
    // sub-extraction is isolated and time-boxed so one slow/failing step can
    // neither hang the spinner forever nor drop the other's result.
    const [textRows, barcodes] = await Promise.all([
      guardExtraction<TextExtraction[]>(
        () => this.adapter.extractText(input, kind),
        [{ text: '', source: 'embedded_text', warnings: ['We could not read this document on your phone. Add the booking details manually.'] }],
      ),
      guardExtraction<BarcodeExtraction[]>(() => this.adapter.extractBarcodes(input, kind), []),
    ]);
    const checksum = await sha256Hex(input.bytes);
    const warnings = textRows.flatMap((row) => row.warnings ?? []);
    const candidates = classifyAndExtract(textRows, barcodes);
    if (!candidates.length) warnings.push('No booking could be identified safely. Review the document manually.');
    return { kind, checksum, candidates, warnings, privacy: { rawBytesUploaded: false, extractedTextPersisted: false } };
  }
}

export function validateDocumentInput(input: DocumentInput): void {
  if (!input || !input.name || !(input.bytes instanceof Uint8Array)) throw new Error('A readable document is required.');
  if (input.size !== input.bytes.byteLength) throw new Error('Document size does not match its bytes.');
  if (input.size <= 0) throw new Error('The selected document is empty.');
  if (input.size > SMART_IMPORT_MAX_BYTES) throw new Error('Document exceeds the 10 MiB limit.');
}

/**
 * Runs one extraction step in isolation. Anything it throws — or takes longer
 * than the ceiling to resolve — degrades to `fallback` instead of rejecting the
 * whole recognition. Keeps a failing barcode/OCR pass from stranding a booking
 * whose text extracted cleanly, and stops a stuck decoder from hanging forever.
 */
async function guardExtraction<T>(run: () => Promise<T>, fallback: T, timeoutMs = 45000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      Promise.resolve().then(run),
      new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); }),
    ]);
  } catch {
    return fallback;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export function detectDocumentKind(input: Pick<DocumentInput, 'name'|'type'|'bytes'>): DocumentKind {
  const ext = input.name.toLowerCase().split('.').pop() ?? '';
  const mime = input.type.toLowerCase();
  const b = input.bytes;
  if (starts(b, [0x25,0x50,0x44,0x46]) || mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ext === 'eml' || mime === 'message/rfc822') return 'eml';
  if (ext === 'ics' || mime === 'text/calendar') return 'ics';
  if (ext === 'pkpass' || mime === 'application/vnd.apple.pkpass') return 'pkpass';
  if (ext === 'docx' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (['jpg','jpeg','png','webp','heic','heif'].includes(ext) || mime.startsWith('image/')) return 'image';
  if (ext === 'txt' || mime.startsWith('text/')) return 'text';
  throw new Error('Unsupported document format. Use PDF, image, TXT, EML, DOCX, ICS, or PKPASS.');
}

export function classifyAndExtract(textRows: TextExtraction[], barcodes: BarcodeExtraction[] = []): RecognitionCandidate[] {
  const cleanRows = textRows.map((row) => ({...row, text: normalizeText(row.text)})).filter((row) => row.text);
  const text = cleanRows.map((row) => row.text).join('\n');
  const lower = text.toLowerCase();
  const scores = new Map<BookingType, number>([
    ['flight', score(lower, ['flight','boarding','departure','arrival','terminal','gate','airline'])],
    ['hotel', score(lower, ['hotel','check-in','check in','check-out','check out','room','nights'])],
    ['train', score(lower, ['train','rail','platform','coach','carriage','station'])],
    ['car', score(lower, ['car rental','rental car','pick-up','pickup','vehicle'])],
    ['transfer', score(lower, ['transfer','driver','pickup location','meet and greet'])],
    ['ferry', score(lower, ['ferry','vessel','port','sailing'])],
    ['activity', score(lower, ['tour','activity','admission','experience'])],
    ['restaurant', score(lower, ['restaurant','table','party size','dinner','lunch'])],
    ['reservation', score(lower, ['reservation','booking confirmation','confirmation number'])],
    ['generic_ticket', score(lower, ['ticket','admit','entry','barcode','qr code']) + (barcodes.length ? 2 : 0)],
  ]);
  const ranked = [...scores.entries()].sort((a,b) => b[1]-a[1]);
  if (!ranked[0] || ranked[0][1] < 2) return [];
  const type = ranked[0][0];
  const source = cleanRows[0]?.source ?? (barcodes.length ? 'barcode' : 'embedded_text');
  const fields: Record<string, ExtractedField> = {};
  add(fields, 'confirmationNumber', match(text, /(?:confirmation(?:\s+(?:number|code|no\.?))?|booking\s+(?:code|reference|ref|number|no\.?)|reservation(?:\s+(?:number|code|no\.?))?|record\s+locator|pnr|reference)\s*[:#-]?\s*([A-Z0-9]{5,12})\b/i), 0.82, source);
  add(fields, 'address', match(text, /(?:address|location)\s*:\s*([^\n]{6,180})/i), 0.68, source);
  add(fields, 'seat', match(text, /\bseat\s*[:#-]?\s*([0-9]{1,3}[A-Z])\b/i), 0.88, source);
  add(fields, 'gate', match(text, /\bgate\s*(?:no\.?|number)?\s*[:#-]?\s*([A-Z]?\d{1,3}[A-Z]?)\b/i), 0.82, source);
  add(fields, 'terminal', match(text, /\bterminal\s*[:#-]?\s*(\d{1,2}[A-Z]?)\b|\b(\d{1,2}[A-Z]?)\s+terminal\b/i), 0.82, source);
  if (barcodes.length) add(fields, 'barcodeValue', barcodes[0].value, 0.94, 'barcode');
  const flightSegments = type === 'flight' ? extractFlightSegments(text) : [];
  // A tabular airline itinerary can hold several legs (round trips, connections).
  // Emit one reviewable candidate per leg instead of collapsing to the first flight.
  if (type === 'flight' && flightSegments.length) {
    const routing = extractFlightRouting(text);
    const routeMatch = text.match(/\b([A-Z]{3})\s+[A-Z]{2}\d?\s+([A-Z]{3})\b/);
    const outDep = match(text, /(?:from|departure|departing)\s*[:\-]?\s*(?:[A-Za-z .'-]+\s+)?\(([A-Z]{3})\)|\b([A-Z]{3})\s*(?:→|->|to)\s*[A-Z]{3}\b/i) || (routeMatch?.[1] ?? null);
    const outArr = match(text, /(?:to|arrival|arriving)\s*[:\-]?\s*(?:[A-Za-z .'-]+\s+)?\(([A-Z]{3})\)|\b[A-Z]{3}\s*(?:→|->|to)\s*([A-Z]{3})\b/i) || (routeMatch?.[2] ?? null);
    const evidence = cleanRows.slice(0,3).map((r) => ({ source: r.source, text: r.text.slice(0,240) }));
    return flightSegments.map((seg, i) => {
      const segFields: Record<string, ExtractedField> = {};
      // Terminal/gate/seat are positional in the text stream and can't be safely
      // attributed to later legs, so only the first leg inherits document facts.
      if (i === 0) Object.assign(segFields, fields);
      else if (fields.confirmationNumber) segFields.confirmationNumber = fields.confirmationNumber;
      add(segFields, 'airlineCode', seg.airline, 0.82, source);
      add(segFields, 'flightNumber', seg.number, 0.82, source);
      add(segFields, 'serviceNumber', `${seg.airline} ${seg.number}`, 0.8, source);
      const dep = routing[i] ?? (i === 0 ? outDep : null);
      const arr = routing[i + 1] ?? (i === 0 ? outArr : null);
      add(segFields, 'departureIata', dep, 0.7, source);
      add(segFields, 'arrivalIata', arr, 0.7, source);
      add(segFields, 'departureLocalDatetime', `${seg.depDate}T${seg.depTime}`, 0.8, source);
      add(segFields, 'arrivalLocalDatetime', `${seg.arrDate}T${seg.arrTime}`, 0.8, source);
      segFields.title = { value: `${seg.airline} ${seg.number}`, confidence: round(0.7), source };
      const segWarnings: string[] = [];
      if (!dep || !arr) segWarnings.push('Confirm this leg’s airports before adding.');
      const confidence = round(Math.min(0.92, 0.62 + Object.keys(segFields).length * 0.03));
      return { type, confidence, fields: segFields, warnings: segWarnings, evidence };
    });
  }
  add(fields, 'title', titleFor(text, type), 0.55, source);
  let serviceNumber=match(text, /\b(?:marketing\s+)?(?:flight|train|service)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Z]{1,3}\s?\d{1,5}[A-Z]?)\b/i);
  add(fields, 'serviceNumber', serviceNumber, 0.78, source);
  if(type==='flight'&&serviceNumber){const flight=serviceNumber.replace(/\s+/g,'').match(/^([A-Z]{2,3})(\d{1,5}[A-Z]?)$/i);if(flight){add(fields,'airlineCode',flight[1].toUpperCase(),0.78,source);add(fields,'flightNumber',flight[2].toUpperCase(),0.78,source);}}
  add(fields, 'departureIata', match(text, /(?:from|departure|departing)\s*[:\-]?\s*(?:[A-Za-z .'-]+\s+)?\(([A-Z]{3})\)|\b([A-Z]{3})\s*(?:→|->|to)\s*[A-Z]{3}\b/i), 0.72, source);
  add(fields, 'arrivalIata', match(text, /(?:to|arrival|arriving)\s*[:\-]?\s*(?:[A-Za-z .'-]+\s+)?\(([A-Z]{3})\)|\b[A-Z]{3}\s*(?:→|->|to)\s*([A-Z]{3})\b/i), 0.72, source);
  // Amadeus fare-calculation lines encode routing as "TLV LY ZRH ..." — recover
  // the IATA pair from it when the itinerary spells the city names out instead.
  if(type==='flight'&&(!fields.departureIata||!fields.arrivalIata)){const route=text.match(/\b([A-Z]{3})\s+[A-Z]{2}\d?\s+([A-Z]{3})\b/);if(route){if(!fields.departureIata)add(fields,'departureIata',route[1],0.6,source);if(!fields.arrivalIata)add(fields,'arrivalIata',route[2],0.6,source);}}
  add(fields, 'propertyName', type === 'hotel' ? firstMeaningfulLine(text) : null, 0.58, source);
  let dateWarnings: string[] = [];
  {
    const dates = extractUnambiguousDates(text, source);
    Object.assign(fields, dates.fields);
    dateWarnings = dates.warnings;
    if(type==='hotel'){if(fields.startDate)fields.checkInDate=fields.startDate;if(fields.endDate)fields.checkOutDate=fields.endDate;delete fields.startDate;delete fields.endDate;}
  }
  const base = Math.min(0.94, 0.38 + ranked[0][1] * 0.07 + Object.keys(fields).length * 0.035);
  const warnings = [...dateWarnings];
  if (base < 0.7) warnings.push('Low-confidence recognition requires careful review.');
  if (type === 'flight' && (!fields.departureIata || !fields.arrivalIata)) warnings.push('Flight route is incomplete.');
  return [{ type, confidence: round(base), fields, warnings, evidence: cleanRows.slice(0,3).map((r) => ({ source: r.source, text: r.text.slice(0,240) })) }];
}

function extractUnambiguousDates(text: string, source: FieldSource): {fields: Record<string, ExtractedField>; warnings:string[]} {
  const fields: Record<string, ExtractedField> = {}, warnings:string[] = [];
  const iso = [...text.matchAll(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
  const named = [...text.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\w*,?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/gi)];
  // Day-first month-name dates (e.g. "14JAN2027", "14 Jan 2027") common on airline
  // and rail tickets. Unambiguous because the month is spelled, so safe to guess.
  const dmon = [...text.matchAll(/\b(\d{1,2})\s?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s?,?\s?(20\d{2})\b/gi)].map((m) => `${m[3]}-${String(month(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`);
  const normalized = [...iso, ...named.map((m) => `${m[3]}-${String(month(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`), ...dmon];
  if (normalized[0]) add(fields,'startDate',normalized[0],0.84,source);
  if (normalized[1]) add(fields,'endDate',normalized[1],0.8,source);
  if (/\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b/.test(text) && !normalized.length) warnings.push('Numeric date is ambiguous and was not guessed.');
  return {fields,warnings};
}

function add(fields:Record<string,ExtractedField>, key:string, value:string|null, confidence:number, source:FieldSource) { if (value) fields[key] = {value, confidence:round(confidence), source}; }
function match(text:string,re:RegExp):string|null { const m=text.match(re); return m ? String(m[1] || m[2] || '').trim() || null : null; }
function score(text:string,words:string[]):number { return words.reduce((n,w)=>n+(text.includes(w)?1:0),0); }
function normalizeText(value:string):string { return String(value||'').replace(/\u0000/g,'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim(); }
function firstMeaningfulLine(text:string):string|null { return text.split('\n').map(x=>x.trim()).find(x=>x.length>=3&&x.length<=120&&!/^(?:from|subject|date|content-type):|^-{3,}\s*forwarded/i.test(x))??null; }
function titleFor(text:string,type:BookingType):string { return firstMeaningfulLine(text) ?? type.replace('_',' '); }
function month(name:string):number { return ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(name.slice(0,3).toLowerCase())+1; }

interface FlightSegment { airline:string; number:string; depTime:string; depDate:string; arrTime:string; arrDate:string; }
/**
 * Pull flight legs from a tabular airline itinerary row such as
 * "LY343 16:20 14JAN2027 19:50 14JAN2027" (Amadeus/Sabre e-tickets). Each row
 * carries the flight designator, departure/arrival local time and date in one
 * line, which is far more reliable than scanning the whole document for a loose
 * flight number and date. Returns segments in document order (outbound first).
 */
function extractFlightSegments(text:string):FlightSegment[] {
  const re=/\b([A-Z]{2})\s?(\d{2,4})[A-Z]?\s+(\d{1,2}:\d{2})\s+(\d{1,2})\s?([A-Za-z]{3})[a-z]*\.?\s?(20\d{2})\s+(\d{1,2}:\d{2})\s+(\d{1,2})\s?([A-Za-z]{3})[a-z]*\.?\s?(20\d{2})/g;
  const segments:FlightSegment[]=[];
  for(const m of text.matchAll(re)){
    const depMonth=month(m[5]),arrMonth=month(m[9]);
    if(depMonth<1||arrMonth<1)continue;
    segments.push({
      airline:m[1].toUpperCase(),
      number:m[2],
      depTime:m[3].padStart(5,'0'),
      depDate:`${m[6]}-${String(depMonth).padStart(2,'0')}-${m[4].padStart(2,'0')}`,
      arrTime:m[7].padStart(5,'0'),
      arrDate:`${m[10]}-${String(arrMonth).padStart(2,'0')}-${m[8].padStart(2,'0')}`,
    });
  }
  return segments;
}
/**
 * Recover the ordered airport routing from an Amadeus/Sabre fare-calculation line
 * such as "TLV LY ZRH ... LY TLV" → [TLV, ZRH, TLV]. Airline designators are two
 * letters, so the three-letter token filter keeps only airport codes. Used to
 * assign each round-trip / multi-leg segment its own departure and arrival IATA.
 */
function extractFlightRouting(text:string):string[] {
  const region=(text.match(/fare\s*calc[^]{0,220}/i)?.[0]||'').split(/NUC|\bEND\b|\bROE\b|Form of payment|Total|Taxes/i)[0];
  const deny=new Set(['USD','EUR','GBP','ILS','CHF','NUC','END','ROE','EXT','NVB','NVA','ADT','CHD','INF']);
  return [...region.matchAll(/\b([A-Z]{3})\b/g)].map((m)=>m[1].toUpperCase()).filter((code)=>!deny.has(code));
}
function starts(bytes:Uint8Array,prefix:number[]):boolean { return prefix.every((v,i)=>bytes[i]===v); }
function round(n:number):number { return Math.round(n*100)/100; }
async function sha256Hex(bytes:Uint8Array):Promise<string> { const digest=await crypto.subtle.digest('SHA-256',bytes.slice().buffer as ArrayBuffer); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
