import { parseMime } from '../../packages/importer/src/mime.ts';
import { parseForwardedEmail } from '../../packages/importer/src/index.ts';

function assert(condition:unknown,label:string):asserts condition{if(!condition)throw new Error(`Inbound-email scenario failed: ${label}`);}

// 1. Plain, non-MIME text body must NOT be mangled by the MIME parser.
const plain=parseMime('Booking reference: ABC123\nFlight: LY 383\nTLV -> FCO');
assert(plain.text.includes('ABC123'),'plain body preserved');
assert(plain.attachments.length===0,'plain body has no attachments');
assert(plain.htmlOnly===false,'plain body is not html-derived');

// 2. RFC822 with headers: Subject / From / Message-ID extracted, body separated from headers.
const withHeaders=parseMime([
  'Subject: Flight confirmation LY383',
  'From: Airline <noreply@airline.test>',
  'Message-ID: <abc.123@airline.test>',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Booking reference: ABC123',
].join('\r\n'));
assert(withHeaders.subject==='Flight confirmation LY383','subject header');
assert(withHeaders.from!.includes('noreply@airline.test'),'from header');
assert(withHeaders.messageId==='abc.123@airline.test','message-id unwrapped');
assert(!withHeaders.text.includes('Subject:'),'headers not leaked into text body');
assert(withHeaders.text.includes('Booking reference: ABC123'),'text body extracted');

// 3. multipart/alternative — prefer text/plain over text/html.
const alt=parseMime([
  'Subject: Hotel confirmation',
  'Content-Type: multipart/alternative; boundary="B1"',
  '',
  '--B1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hotel: Hotel Artemide',
  '--B1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><h1>Hotel Artemide</h1></body></html>',
  '--B1--',
].join('\r\n'));
assert(alt.text.includes('Hotel: Hotel Artemide'),'multipart/alternative prefers text/plain');
assert(alt.htmlOnly===false,'text/plain present so not html-only');

// 4. HTML-only email is sanitized to text; script/style stripped; nothing executed/fetched.
const htmlOnly=parseMime([
  'Subject: Restaurant reservation',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><head><style>.x{color:red}</style><title>ignore</title></head>',
  '<body><script>fetch("https://evil.test/steal")</script>',
  '<p>Restaurant: Osteria Roma</p><p>Confirmation: RES44</p>',
  '<img src="https://tracker.test/pixel.gif"></body></html>',
].join('\r\n'));
assert(htmlOnly.htmlOnly===true,'html-only flagged');
assert(htmlOnly.text.includes('Restaurant: Osteria Roma'),'html reduced to text');
assert(!/fetch\(|evil\.test|tracker\.test/.test(htmlOnly.text),'scripts and remote resources stripped, never executed/fetched');
assert(!/<[a-z]/i.test(htmlOnly.text),'no raw tags survive');

// 5. quoted-printable decoding + header unfolding.
const qp=parseMime([
  'Subject: =?utf-8?Q?Caf=C3=A9_booking?=',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Confirmation: CAF=C3=89 123 for the Caf=C3=A9 Rome',
].join('\r\n'));
assert(qp.subject==='Café booking','RFC2047 Q-encoded subject decoded');
assert(qp.text.includes('Café Rome'),'quoted-printable body decoded');

// 6. base64-encoded text/plain part decoded.
const b64Body=btoa('Confirmation: B64XYZ\nHotel: Base Hotel');
const b64=parseMime([
  'Subject: Encoded booking',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: base64',
  '',
  b64Body,
].join('\r\n'));
assert(b64.text.includes('B64XYZ'),'base64 body decoded');

// 7. multipart/mixed with inline image + PDF attachment — metadata only, bytes never enter text.
const mixed=parseMime([
  'Subject: Itinerary with attachments',
  'Content-Type: multipart/mixed; boundary="M1"',
  '',
  '--M1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Confirmation: MIX01',
  '--M1',
  'Content-Type: image/png',
  'Content-Disposition: inline; filename="logo.png"',
  'Content-Transfer-Encoding: base64',
  '',
  'aW1hZ2Vib2R5ZGF0YQ==',
  '--M1',
  'Content-Type: application/pdf; name="eticket.pdf"',
  'Content-Disposition: attachment; filename="eticket.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQKJeLjz9M=',
  '--M1--',
].join('\r\n'));
assert(mixed.text.trim()==='Confirmation: MIX01','only the text part is in the body');
assert(mixed.attachments.length===2,'both attachments recorded as metadata');
assert(mixed.attachments.some(a=>a.contentType==='application/pdf'&&a.filename==='eticket.pdf'),'pdf attachment metadata');
assert(mixed.attachments.some(a=>a.contentType==='image/png'),'inline image recorded as metadata');
assert(mixed.attachments.every(a=>Number.isFinite(a.size)&&a.size>0),'attachment size approximated, bytes not stored');
assert(!/aW1hZ2Vib2R5|JVBERi0/.test(mixed.text),'attachment bytes never enter the text stream');

// 8. Forwarded email carrying an inner message/rfc822.
const forwarded=parseMime([
  'Subject: Fwd: Train ticket',
  'Content-Type: multipart/mixed; boundary="F1"',
  '',
  '--F1',
  'Content-Type: text/plain',
  '',
  'See attached original.',
  '--F1',
  'Content-Type: message/rfc822',
  '',
  'Subject: Train ticket',
  'Content-Type: text/plain',
  '',
  'Eurostar Confirmation: EUR999 Paris -> London',
  '--F1--',
].join('\r\n'));
assert(forwarded.text.includes('EUR999'),'inner forwarded message body extracted');

// 9. Bounded: a huge inline image never blocks text parsing and cannot blow up the text stream.
const bigB64='QUJD'.repeat(200000); // ~0.8MB of base64
const huge=parseMime([
  'Subject: Big booking',
  'Content-Type: multipart/mixed; boundary="H1"',
  '',
  '--H1',
  'Content-Type: text/plain',
  '',
  'Confirmation: HUGE01',
  '--H1',
  'Content-Type: image/jpeg',
  'Content-Disposition: inline; filename="huge.jpg"',
  'Content-Transfer-Encoding: base64',
  '',
  bigB64,
  '--H1--',
].join('\r\n'));
assert(huge.text.includes('HUGE01'),'text survives alongside a huge inline image');
assert(huge.text.length<1024,'huge attachment bytes never enter the bounded text stream');

// 10. End-to-end: MIME clean text feeds the deterministic importer and yields a candidate.
const parsedMime=parseMime([
  'Subject: Flight confirmation',
  'From: Airline <noreply@airline.test>',
  'Content-Type: multipart/alternative; boundary="E1"',
  '',
  '--E1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Booking reference: ABC123',
  'Flight: LY 383',
  'TLV -> FCO',
  'Departure: 2026-09-01 10:30',
  'Arrival: 2026-09-01 13:15',
  '--E1--',
].join('\r\n'));
const imported=parseForwardedEmail({sender:parsedMime.from,subject:parsedMime.subject,body:parsedMime.text});
assert(imported.candidates.some(x=>x.candidateType==='flight'),'clean MIME text imports as a flight candidate');

console.log('Inbound-email MIME scenarios passed: plain-text safety, header extraction, multipart/alternative, sanitized HTML (no execution/fetch), quoted-printable, base64, attachment-metadata-only, forwarded message/rfc822, bounded huge-attachment handling, and end-to-end import.');
