import { AIDocumentRecognitionProvider, LocalDocumentRecognitionProvider, SMART_IMPORT_MAX_BYTES, classifyAndExtract, detectDocumentKind, type DocumentExtractionAdapter, type DocumentInput, type DocumentKind } from '../../packages/document-recognition/src/index.ts';

const assert={equal(a:unknown,b:unknown,label='values differ'){if(a!==b)throw new Error(`${label}: ${String(a)} !== ${String(b)}`);},ok(value:unknown,label='assertion failed'){if(!value)throw new Error(label);},throws(fn:()=>unknown,re:RegExp){try{fn();}catch(error){if(re.test(String(error)))return;throw error;}throw new Error('Expected function to throw.');},async rejects(fn:()=>Promise<unknown>,re:RegExp){try{await fn();}catch(error){if(re.test(String(error)))return;throw error;}throw new Error('Expected promise to reject.');}};

const bytes=(value:string)=>new TextEncoder().encode(value);
const input=(name:string,type:string,content='fixture'):DocumentInput=>({name,type,bytes:bytes(content),size:bytes(content).length});
const formats:[string,string,DocumentKind][]=[['ticket.pdf','application/pdf','pdf'],['photo.JPG','image/jpeg','image'],['booking.png','image/png','image'],['scan.webp','image/webp','image'],['camera.heic','image/heic','image'],['note.txt','text/plain','text'],['forward.eml','message/rfc822','eml'],['booking.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'],['event.ics','text/calendar','ics'],['pass.pkpass','application/vnd.apple.pkpass','pkpass']];
for(const [name,mime,kind] of formats)assert.equal(detectDocumentKind(input(name,mime)),kind,`${name} detected`);
assert.equal(detectDocumentKind({name:'unknown',type:'',bytes:new Uint8Array([0x25,0x50,0x44,0x46])}),'pdf','PDF magic wins');
assert.throws(()=>detectDocumentKind(input('payload.exe','application/octet-stream')),/Unsupported/);

const cases=[
  ['flight','Flight LY 383\nTLV -> FCO\nTerminal 3\nSeat 12A\nBooking reference ABC123'],
  ['hotel','Hotel Artemide\nCheck-in August 20, 2026\nCheck-out August 26, 2026\nConfirmation number HTL123'],
  ['train','Train 9524\nRoma Termini station\nPlatform 8\nCoach 4'],
  ['car','Car rental confirmation\nPickup location Rome Airport\nVehicle class compact'],
  ['transfer','Airport transfer\nMeet and greet\nDriver pickup location'],
  ['ferry','Ferry ticket\nPort departure\nVessel Aurora\nSailing confirmed'],
  ['activity','Guided tour activity\nAdmission ticket\nBooking confirmation ACT123'],
  ['restaurant','Restaurant dinner reservation\nParty size 2\nConfirmation number DIN123'],
] as const;
for(const [expected,text] of cases){const found=classifyAndExtract([{text,source:'embedded_text'}]);assert.equal(found[0]?.type,expected,`${expected} classified`);assert.ok(found[0]?.confidence>0&&found[0]?.confidence<=1);}
const ambiguous=classifyAndExtract([{text:'Flight LY 383 TLV -> FCO Departure 03/04/26 Arrival 03/04/26',source:'embedded_text'}])[0];
assert.ok(ambiguous.warnings.some(w=>/ambiguous/i.test(w)),'ambiguous date warned');
assert.equal(ambiguous.fields.startDate,undefined,'ambiguous date not guessed');
const flight=classifyAndExtract([{text:'Flight LY 383 TLV -> FCO Seat 12A Gate D7 Terminal 3',source:'ocr'}])[0];
assert.equal(flight.fields.airlineCode.value,'LY');assert.equal(flight.fields.flightNumber.value,'383');assert.equal(flight.fields.seat.source,'ocr');
assert.equal(classifyAndExtract([{text:'hello world',source:'embedded_text'}]).length,0,'unrecognized document stays unsupported');

const adapter:DocumentExtractionAdapter={async extractText(_input,_kind){return[{text:'Train 72 station platform coach',source:'embedded_text'}];},async extractBarcodes(){return[{value:'SAFE-QR-123',format:'qr_code'}];}};
const provider=new LocalDocumentRecognitionProvider(adapter);
const result=await provider.recognize(input('ticket.txt','text/plain','Train 72'));
assert.equal(result.privacy.rawBytesUploaded,false);assert.equal(result.privacy.extractedTextPersisted,false);assert.equal(result.checksum.length,64);assert.ok(result.candidates[0].fields.barcodeValue);
const tooLarge={name:'large.pdf',type:'application/pdf',size:SMART_IMPORT_MAX_BYTES+1,bytes:new Uint8Array(SMART_IMPORT_MAX_BYTES+1)};
await assert.rejects(()=>provider.recognize(tooLarge),/10 MiB/);
await assert.rejects(()=>new AIDocumentRecognitionProvider().recognize(input('x.txt','text/plain')),/disabled/);
console.log(`Smart Import scenarios passed: ${formats.length} formats, ${cases.length} booking classes, ambiguity, provenance, privacy and limits.`);
