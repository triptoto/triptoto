// Safe RFC822/MIME parser for forwarded booking emails.
//
// Goals (see FIX EMAIL PARSING / SIZE requirements):
//  - Never treat a raw MIME payload as if it were plain text.
//  - Extract Subject, From, Message-ID, a clean text body (text/plain preferred,
//    sanitized text/html as fallback), and attachment metadata only.
//  - Handle multipart/alternative, multipart/mixed/related, message/rfc822,
//    quoted-printable and base64 transfer encodings, and RFC2047 encoded words.
//  - HTML is reduced to text by stripping tags and decoding entities. Nothing is
//    executed and no remote resource is ever fetched (pure string processing).
//  - Bounded: the extracted text is capped so an email full of inline images or
//    huge base64 attachments can never blow up the downstream importer.

export interface MimeAttachment {
  filename: string | null;
  contentType: string;
  size: number; // approximate decoded byte size; never stored, metadata only
}

export interface ParsedMime {
  subject: string | null;
  from: string | null;
  messageId: string | null;
  text: string;
  htmlOnly: boolean; // true when the only body was HTML-derived text
  attachments: MimeAttachment[];
  truncated: boolean;
}

// Hard cap on the clean text handed to the deterministic importer. Realistic
// confirmation emails are a few KB of text; inline images/attachments are not
// counted here because they are never decoded into the text stream.
const MAX_TEXT_CHARS = 256 * 1024;
const MAX_DEPTH = 20;
const MAX_ATTACHMENTS = 50;

interface Buckets { text: string[]; html: string[]; attachments: MimeAttachment[]; }

export function parseMime(raw: string): ParsedMime {
  const normalized = String(raw ?? '').replace(/\r\n?/g, '\n');
  const { headers, body } = splitHeadersBody(normalized);
  const buckets: Buckets = { text: [], html: [], attachments: [] };
  walkPart(headers, body, buckets, 0);

  let htmlOnly = false;
  let text = buckets.text.join('\n\n').trim();
  if (!text && buckets.html.length) {
    text = buckets.html.join('\n\n').trim();
    htmlOnly = true;
  }
  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS);

  return {
    subject: decodeEncodedWords(headers.get('subject')) || null,
    from: decodeEncodedWords(headers.get('from')) || null,
    messageId: extractMessageId(headers.get('message-id')),
    text,
    htmlOnly,
    attachments: buckets.attachments.slice(0, MAX_ATTACHMENTS),
    truncated,
  };
}

function walkPart(headers: Map<string, string>, body: string, buckets: Buckets, depth: number): void {
  if (depth > MAX_DEPTH) return;
  const { media, params } = parseContentType(headers.get('content-type') || 'text/plain');
  const cte = (headers.get('content-transfer-encoding') || '').toLowerCase().trim();
  const disposition = headers.get('content-disposition') || '';

  if (media.startsWith('multipart/') && params.boundary) {
    for (const segment of splitMultipart(body, params.boundary)) {
      const part = splitHeadersBody(segment);
      walkPart(part.headers, part.body, buckets, depth + 1);
    }
    return;
  }
  if (media === 'message/rfc822') {
    const inner = splitHeadersBody(body);
    walkPart(inner.headers, inner.body, buckets, depth + 1);
    return;
  }

  const filename = decodeEncodedWords(paramValue(params, 'name') || dispositionFilename(disposition)) || null;
  const isAttachment = /(^|;|\s)attachment/i.test(disposition) ||
    (!!filename && media !== 'text/plain' && media !== 'text/html');

  if (!isAttachment && media === 'text/plain') {
    buckets.text.push(decodeContent(body, cte));
    return;
  }
  if (!isAttachment && media === 'text/html') {
    buckets.html.push(stripHtml(decodeContent(body, cte)));
    return;
  }
  // Anything else (application/pdf, image/*, inline images, calendar, ...) is
  // recorded as metadata only — its bytes never enter the text stream or storage.
  if (buckets.attachments.length < MAX_ATTACHMENTS) {
    buckets.attachments.push({ filename, contentType: media, size: approximateSize(body, cte) });
  }
}

// --- header / body splitting -------------------------------------------------

function splitHeadersBody(block: string): { headers: Map<string, string>; body: string } {
  const idx = block.indexOf('\n\n');
  if (idx < 0) {
    // No header/body separator. If the block looks like headers, treat it all as
    // headers; otherwise it is a bare text body (e.g. a plain, non-MIME email).
    if (looksLikeHeaders(block)) return { headers: parseHeaders(block), body: '' };
    return { headers: new Map(), body: block };
  }
  const headerBlock = block.slice(0, idx);
  const body = block.slice(idx + 2);
  if (!looksLikeHeaders(headerBlock)) return { headers: new Map(), body: block };
  return { headers: parseHeaders(headerBlock), body };
}

function looksLikeHeaders(block: string): boolean {
  const first = block.split('\n', 1)[0] || '';
  return /^[!-9;-~]+:/.test(first);
}

function parseHeaders(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = block.split('\n');
  let name: string | null = null;
  let value = '';
  const commit = () => { if (name && !map.has(name)) map.set(name, value.trim()); };
  for (const line of lines) {
    if (/^[ \t]/.test(line) && name) { value += ' ' + line.trim(); continue; }
    const m = line.match(/^([!-9;-~]+):(.*)$/);
    if (m) { commit(); name = m[1].toLowerCase(); value = m[2]; }
  }
  commit();
  return map;
}

// --- content type ------------------------------------------------------------

function parseContentType(value: string): { media: string; params: Record<string, string> } {
  const parts = value.split(';');
  const media = (parts[0] || 'text/plain').trim().toLowerCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const m = parts[i].match(/^\s*([^=\s]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (v.startsWith('"')) v = v.replace(/^"([\s\S]*?)"?$/, '$1');
    params[m[1].toLowerCase()] = v;
  }
  return { media, params };
}

function paramValue(params: Record<string, string>, key: string): string | null {
  return params[key] ?? null;
}

function dispositionFilename(disposition: string): string | null {
  const m = disposition.match(/filename\*?=(?:"([^"]*)"|([^;]+))/i);
  return (m ? (m[1] ?? m[2]) : '').trim() || null;
}

// --- multipart ---------------------------------------------------------------

function splitMultipart(body: string, boundary: string): string[] {
  const delim = '--' + boundary;
  const segments = body.split(delim);
  const parts: string[] = [];
  for (let i = 1; i < segments.length; i++) {
    let seg = segments[i];
    if (seg.startsWith('--')) break; // closing delimiter "--boundary--"
    seg = seg.replace(/^\n/, '');
    parts.push(seg);
  }
  return parts;
}

// --- transfer decoding -------------------------------------------------------

function decodeContent(body: string, cte: string): string {
  if (cte === 'base64') return decodeBase64ToText(body);
  if (cte === 'quoted-printable') return decodeQuotedPrintable(body);
  return body; // 7bit / 8bit / binary / none
}

function decodeQuotedPrintable(value: string): string {
  const withoutSoft = value.replace(/=\n/g, ''); // soft line breaks
  // Decode to a byte stream first, then interpret as UTF-8. Doing the =XX
  // substitution with fromCharCode per byte (as a naive decoder would) corrupts
  // any multibyte character (é, £, emoji, ...); collecting bytes and decoding
  // once keeps accented confirmation text intact.
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < withoutSoft.length; i++) {
    const ch = withoutSoft[i];
    if (ch === '=' && i + 2 < withoutSoft.length && /^[0-9A-Fa-f]{2}$/.test(withoutSoft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(withoutSoft.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x80) bytes.push(code);
    else for (const b of encoder.encode(ch)) bytes.push(b);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
}

function decodeBase64ToText(value: string): string {
  const clean = value.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) return '';
  try {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function approximateSize(body: string, cte: string): number {
  if (cte === 'base64') {
    const clean = body.replace(/[^A-Za-z0-9+/=]/g, '');
    const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor(clean.length * 3 / 4) - pad);
  }
  return body.length;
}

// --- HTML → text (no execution, no remote fetch) -----------------------------

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style|head|title)[\s\S]*?<\/\1\s*>/gi, '')
      .replace(/<\/(p|div|tr|table|li|ul|ol|h[1-6]|blockquote)\s*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'",
  };
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? safeFromCodePoint(code) : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function safeFromCodePoint(code: number): string {
  try { return String.fromCodePoint(code); } catch { return ''; }
}

// --- RFC2047 encoded words ---------------------------------------------------

function decodeEncodedWords(value: string | null | undefined): string {
  const raw = String(value ?? '');
  if (!raw.includes('=?')) return raw.trim();
  return raw
    .replace(/=\?[^?]+\?([BbQq])\?([^?]*)\?=/g, (_m, enc: string, data: string) => {
      if (enc.toLowerCase() === 'b') return decodeBase64ToText(data);
      // Q encoding: underscores are spaces, =XX are hex bytes.
      const qp = data.replace(/_/g, ' ');
      return decodeQuotedPrintable(qp);
    })
    .replace(/\?=\s+=\?/g, '') // join adjacent encoded words
    .trim();
}

function extractMessageId(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).slice(0, 500);
}
