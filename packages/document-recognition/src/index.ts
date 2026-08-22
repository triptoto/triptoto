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
    const [textRows, barcodes] = await Promise.all([
      this.adapter.extractText(input, kind),
      this.adapter.extractBarcodes(input, kind),
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
  add(fields, 'title', titleFor(text, type), 0.55, source);
  add(fields, 'confirmationNumber', match(text, /(?:confirmation(?:\s+(?:number|code|no\.?))?|booking\s+reference|reservation(?:\s+(?:number|code|no\.?))?|pnr|reference)\s*[:#-]?\s*([A-Z0-9]{5,12})\b/i), 0.82, source);
  const serviceNumber=match(text, /\b(?:marketing\s+)?(?:flight|train|service)\s*(?:no\.?|number|#)?\s*[:#-]?\s*([A-Z]{1,3}\s?\d{1,5}[A-Z]?)\b/i);
  add(fields, 'serviceNumber', serviceNumber, 0.78, source);
  if(type==='flight'&&serviceNumber){const flight=serviceNumber.replace(/\s+/g,'').match(/^([A-Z]{2,3})(\d{1,5}[A-Z]?)$/i);if(flight){add(fields,'airlineCode',flight[1].toUpperCase(),0.78,source);add(fields,'flightNumber',flight[2].toUpperCase(),0.78,source);}}
  add(fields, 'departureIata', match(text, /(?:from|departure|departing)\s*[:\-]?\s*(?:[A-Za-z .'-]+\s+)?\(([A-Z]{3})\)|\b([A-Z]{3})\s*(?:→|->|to)\s*[A-Z]{3}\b/i), 0.72, source);
  add(fields, 'arrivalIata', match(text, /(?:to|arrival|arriving)\s*[:\-]?\s*(?:[A-Za-z .'-]+\s+)?\(([A-Z]{3})\)|\b[A-Z]{3}\s*(?:→|->|to)\s*([A-Z]{3})\b/i), 0.72, source);
  add(fields, 'propertyName', type === 'hotel' ? firstMeaningfulLine(text) : null, 0.58, source);
  add(fields, 'address', match(text, /(?:address|location)\s*:\s*([^\n]{6,180})/i), 0.68, source);
  add(fields, 'seat', match(text, /\bseat\s*[:#-]?\s*([0-9]{1,3}[A-Z])\b/i), 0.88, source);
  add(fields, 'gate', match(text, /\bgate\s*[:#-]?\s*([A-Z0-9]{1,6})\b/i), 0.82, source);
  add(fields, 'terminal', match(text, /\bterminal\s*[:#-]?\s*([A-Z0-9]{1,8})\b/i), 0.82, source);
  const dates = extractUnambiguousDates(text, source);
  Object.assign(fields, dates.fields);
  if(type==='hotel'){if(fields.startDate)fields.checkInDate=fields.startDate;if(fields.endDate)fields.checkOutDate=fields.endDate;delete fields.startDate;delete fields.endDate;}
  if (barcodes.length) add(fields, 'barcodeValue', barcodes[0].value, 0.94, 'barcode');
  const base = Math.min(0.94, 0.38 + ranked[0][1] * 0.07 + Object.keys(fields).length * 0.035);
  const warnings = [...dates.warnings];
  if (base < 0.7) warnings.push('Low-confidence recognition requires careful review.');
  if (type === 'flight' && (!fields.departureIata || !fields.arrivalIata)) warnings.push('Flight route is incomplete.');
  return [{ type, confidence: round(base), fields, warnings, evidence: cleanRows.slice(0,3).map((r) => ({ source: r.source, text: r.text.slice(0,240) })) }];
}

function extractUnambiguousDates(text: string, source: FieldSource): {fields: Record<string, ExtractedField>; warnings:string[]} {
  const fields: Record<string, ExtractedField> = {}, warnings:string[] = [];
  const iso = [...text.matchAll(/\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`);
  const named = [...text.matchAll(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\w*,?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(20\d{2})\b/gi)];
  const normalized = [...iso, ...named.map((m) => `${m[3]}-${String(month(m[1])).padStart(2,'0')}-${String(Number(m[2])).padStart(2,'0')}`)];
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
function starts(bytes:Uint8Array,prefix:number[]):boolean { return prefix.every((v,i)=>bytes[i]===v); }
function round(n:number):number { return Math.round(n*100)/100; }
async function sha256Hex(bytes:Uint8Array):Promise<string> { const digest=await crypto.subtle.digest('SHA-256',bytes.slice().buffer as ArrayBuffer); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
