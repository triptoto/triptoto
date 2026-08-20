export interface ForwardedEmailInput {
  sender?: string | null;
  subject?: string | null;
  body: string;
}

export interface ParsedImportCandidate {
  candidateType: 'flight' | 'stay';
  payload: Record<string, unknown>;
  confidence: number;
  warnings: string[];
}

export interface ParsedForwardedEmail {
  candidates: ParsedImportCandidate[];
  normalizedText: string;
  unsupportedReason?: string;
}

const MONTHS: Record<string, number> = {
  jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,
  jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12,
};

export function parseForwardedEmail(input: ForwardedEmailInput): ParsedForwardedEmail {
  const body = normalize(input.body);
  const subject = normalize(input.subject ?? '');
  const text = `${subject}\n${body}`.trim();
  const candidates: ParsedImportCandidate[] = [];

  const flight = parseFlight(text);
  if (flight) candidates.push(flight);
  const stay = parseStay(text, subject);
  if (stay) candidates.push(stay);

  return {
    candidates,
    normalizedText: text,
    unsupportedReason: candidates.length ? undefined : 'No supported flight or stay booking could be identified deterministically.',
  };
}

function parseFlight(text: string): ParsedImportCandidate | null {
  const route = extractRoute(text);
  const flightNo = extractFlightNumber(text);
  const hasFlightWords = /\b(flight|boarding|airline|departure|arrival)\b/i.test(text);
  if (!hasFlightWords && !route && !flightNo) return null;

  const departure = extractLabeledDateTime(text, ['departure','depart','dep']);
  const arrival = extractLabeledDateTime(text, ['arrival','arrive','arr']);
  const confirmation = extractConfirmation(text);
  const warnings: string[] = [];
  if (!route) warnings.push('Departure/arrival airport codes were not confidently detected.');
  if (!flightNo) warnings.push('Airline/flight number was not confidently detected.');
  if (!departure || !arrival) warnings.push('Departure/arrival local times need confirmation.');
  warnings.push('Airport timezones must be confirmed before creating the flight.');

  let score = 0.35;
  if (route) score += 0.2;
  if (flightNo) score += 0.2;
  if (departure) score += 0.1;
  if (arrival) score += 0.1;
  if (confirmation) score += 0.05;

  return {
    candidateType: 'flight',
    confidence: Math.min(score, 0.95),
    warnings,
    payload: {
      airlineCode: flightNo?.airlineCode ?? null,
      flightNumber: flightNo?.flightNumber ?? null,
      departureIata: route?.from ?? null,
      arrivalIata: route?.to ?? null,
      departureLocal: departure,
      arrivalLocal: arrival,
      departureTimezone: null,
      arrivalTimezone: null,
      confirmationNumber: confirmation,
    },
  };
}

function parseStay(text: string, subject: string): ParsedImportCandidate | null {
  const hasStayWords = /\b(hotel|stay|accommodation|check[ -]?in|check[ -]?out|room)\b/i.test(text);
  if (!hasStayWords) return null;
  const propertyName = extractField(text, ['hotel','property','accommodation']) ?? inferPropertyFromSubject(subject);
  const checkInDate = extractLabeledDate(text, ['check-in','check in','arrival date']);
  const checkOutDate = extractLabeledDate(text, ['check-out','check out','departure date']);
  const confirmation = extractConfirmation(text);
  const address = extractField(text, ['address','hotel address','property address']);
  const warnings: string[] = [];
  if (!propertyName) warnings.push('Property name needs confirmation.');
  if (!checkInDate) warnings.push('Check-in date needs confirmation.');
  if (!checkOutDate) warnings.push('Check-out date needs confirmation.');

  let score = 0.4;
  if (propertyName) score += 0.2;
  if (checkInDate) score += 0.15;
  if (checkOutDate) score += 0.15;
  if (confirmation) score += 0.05;
  if (address) score += 0.05;

  return {
    candidateType: 'stay',
    confidence: Math.min(score, 0.95),
    warnings,
    payload: { propertyName, checkInDate, checkOutDate, confirmationNumber: confirmation, address },
  };
}

function normalize(value: string): string {
  return value.replace(/\r\n?/g,'\n').replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{2,}/g,'\n').trim();
}

function extractRoute(text: string): { from: string; to: string } | null {
  const patterns = [
    /\b([A-Z]{3})\s*(?:→|->|–|—|-)\s*([A-Z]{3})\b/,
    /\bfrom\s+([A-Z]{3})\s+(?:to|→|->)\s+([A-Z]{3})\b/i,
    /\bdeparture(?: airport)?\s*[:\-]\s*([A-Z]{3})[\s\S]{0,180}?arrival(?: airport)?\s*[:\-]\s*([A-Z]{3})\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p); if (m) return { from:m[1].toUpperCase(), to:m[2].toUpperCase() };
  }
  return null;
}

function extractFlightNumber(text: string): { airlineCode: string; flightNumber: string } | null {
  const labeled = text.match(/(?:flight(?: number| no\.?| #)?|flt)\s*[:#-]?\s*([A-Z0-9]{2,3})\s*[- ]?\s*(\d{1,4}[A-Z]?)/i);
  if (labeled) return { airlineCode:labeled[1].toUpperCase(), flightNumber:labeled[2].toUpperCase() };
  const generic = text.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{2,4}[A-Z]?)\b/);
  return generic ? { airlineCode:generic[1].toUpperCase(), flightNumber:generic[2].toUpperCase() } : null;
}

function extractConfirmation(text: string): string | null {
  const m = text.match(/(?:confirmation(?: number| no\.?| #)?|booking reference|reservation(?: number| no\.?| #)?|pnr)\s*[:#-]?\s*([A-Z0-9-]{4,24})/i);
  return m?.[1]?.toUpperCase() ?? null;
}

function extractField(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const p = new RegExp(`(?:^|\\n)${escapeRx(label)}\\s*[:\\-]\\s*([^\\n]{2,180})`, 'i');
    const m = text.match(p); if (m) return m[1].trim();
  }
  return null;
}

function inferPropertyFromSubject(subject: string): string | null {
  const cleaned = subject.replace(/^(?:fwd?|re)\s*:\s*/i,'').trim();
  if (!cleaned || /booking|confirmation|reservation/i.test(cleaned) && cleaned.length < 18) return null;
  const m = cleaned.match(/(?:booking|reservation|confirmation)\s+(?:at|for)\s+(.{3,120})/i);
  return m?.[1]?.trim() ?? null;
}

function extractLabeledDateTime(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const p = new RegExp(`${escapeRx(label)}[^\\n]{0,40}?(${dateTokenSource()})[ T,]+(\\d{1,2}:\\d{2})(?:\\s*(AM|PM))?`, 'i');
    const m = text.match(p);
    if (m) {
      const date = parseDateToken(m[1]);
      const time = normalizeTime(m[2], m[3]);
      if (date && time) return `${date}T${time}`;
    }
  }
  return null;
}

function extractLabeledDate(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const p = new RegExp(`${escapeRx(label)}[^\\n]{0,30}?(${dateTokenSource()})`, 'i');
    const m = text.match(p); if (m) { const d=parseDateToken(m[1]); if(d)return d; }
  }
  return null;
}

function dateTokenSource(): string {
  return String.raw`(?:\d{4}[\/-]\d{1,2}[\/-]\d{1,2}|\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})`;
}

function parseDateToken(raw: string): string | null {
  const s=raw.trim(); let y:number,m:number,d:number;
  let x=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if(x){y=+x[1];m=+x[2];d=+x[3];return isoDate(y,m,d);}
  x=s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
  if(x){d=+x[1];m=+x[2];y=+x[3];if(d<=12&&m<=12)return null;return isoDate(y,m,d);}
  x=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if(x){d=+x[1];m=MONTHS[x[2].toLowerCase()]??0;y=+x[3];return isoDate(y,m,d);}
  x=s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if(x){m=MONTHS[x[1].toLowerCase()]??0;d=+x[2];y=+x[3];return isoDate(y,m,d);}
  return null;
}

function isoDate(y:number,m:number,d:number): string | null {
  if(y<1900||y>2200||m<1||m>12||d<1||d>31)return null;
  const dt=new Date(Date.UTC(y,m-1,d));
  if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;
  return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function normalizeTime(raw:string, ampm?:string): string | null {
  const m=raw.match(/^(\d{1,2}):(\d{2})$/); if(!m)return null;
  let h=+m[1], min=+m[2]; if(min>59)return null;
  if(ampm){const p=ampm.toUpperCase();if(h<1||h>12)return null;if(p==='AM'&&h===12)h=0;if(p==='PM'&&h!==12)h+=12;}
  if(h<0||h>23)return null;
  return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
}

function escapeRx(v:string):string{return v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
