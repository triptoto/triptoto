import { unzipSync, strFromU8 } from 'fflate';
import jsQR from 'jsqr';
import { LocalDocumentRecognitionProvider, type BarcodeExtraction, type DocumentExtractionAdapter, type DocumentInput, type DocumentKind, type RecognitionResult, type TextExtraction } from './index.ts';

const decoder=new TextDecoder('utf-8',{fatal:false});

class BrowserExtractionAdapter implements DocumentExtractionAdapter {
  async extractText(input:DocumentInput,kind:DocumentKind):Promise<TextExtraction[]>{
    if(kind==='text')return [{text:decoder.decode(input.bytes),source:'embedded_text'}];
    if(kind==='eml')return [{text:emailText(decoder.decode(input.bytes)),source:'email'}];
    if(kind==='ics')return [{text:calendarText(decoder.decode(input.bytes)),source:'calendar'}];
    if(kind==='docx')return [{text:docxText(input.bytes),source:'embedded_text'}];
    if(kind==='pkpass')return [{text:pkpassText(input.bytes),source:'wallet'}];
    if(kind==='pdf')return pdfText(input.bytes);
    if(kind==='image')return ocrImage(new Blob([input.bytes.slice().buffer as ArrayBuffer],{type:input.type||'application/octet-stream'}));
    return [];
  }
  async extractBarcodes(input:DocumentInput,kind:DocumentKind):Promise<BarcodeExtraction[]>{
    if(kind==='image')return readBarcodes(new Blob([input.bytes.slice().buffer as ArrayBuffer],{type:input.type||'application/octet-stream'}));
    if(kind==='pdf'){
      const canvases=await renderPdf(input.bytes,2);
      const rows:BarcodeExtraction[]=[];
      for(const canvas of canvases)rows.push(...await readCanvasBarcodes(canvas));
      return rows;
    }
    return [];
  }
}

async function recognizeFile(file:File):Promise<RecognitionResult>{
  const bytes=new Uint8Array(await file.arrayBuffer());
  return new LocalDocumentRecognitionProvider(new BrowserExtractionAdapter()).recognize({name:file.name,type:file.type,size:file.size,bytes});
}

async function pdfText(bytes:Uint8Array):Promise<TextExtraction[]>{
  const modulePath='/vendor/pdf/pdf.min.mjs',pdfjs=await import(modulePath);
  pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:bytes,wasmUrl:'/vendor/pdf/wasm/',standardFontDataUrl:'/vendor/pdf/standard_fonts/'}),pdf=await task.promise;
  const parts:string[]=[];
  for(let i=1;i<=Math.min(pdf.numPages,12);i++){const page=await pdf.getPage(i),content=await page.getTextContent();parts.push(content.items.map((item:any)=>typeof item.str==='string'?item.str:'').join(' '));}
  const text=parts.join('\n').trim();
  if(text.length>=40)return [{text,source:'embedded_text'}];
  const canvases=await renderPdf(bytes,Math.min(pdf.numPages,3)),rows:TextExtraction[]=[];
  for(const canvas of canvases)rows.push(...await ocrCanvas(canvas));
  if(!rows.length)rows.push({text,source:'embedded_text',warnings:['This PDF has little readable text and local OCR was unavailable.']});
  return rows;
}

async function renderPdf(bytes:Uint8Array,maxPages:number):Promise<HTMLCanvasElement[]>{
  const modulePath='/vendor/pdf/pdf.min.mjs',pdfjs=await import(modulePath);pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdf/pdf.worker.min.mjs';
  const pdf=await pdfjs.getDocument({data:bytes.slice(),wasmUrl:'/vendor/pdf/wasm/',standardFontDataUrl:'/vendor/pdf/standard_fonts/'}).promise,canvases:HTMLCanvasElement[]=[];
  for(let i=1;i<=Math.min(pdf.numPages,maxPages);i++){const page=await pdf.getPage(i),viewport=page.getViewport({scale:1.6}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);await page.render({canvasContext:canvas.getContext('2d')!,viewport}).promise;canvases.push(canvas);}
  return canvases;
}

async function ocrImage(blob:Blob):Promise<TextExtraction[]>{const canvas=await blobCanvas(blob);return ocrCanvas(canvas);}
async function ocrCanvas(canvas:HTMLCanvasElement):Promise<TextExtraction[]>{
  try{
    const modulePath='/vendor/tesseract/tesseract.esm.min.js',tesseract=await import(modulePath);
    const worker=await tesseract.createWorker('eng',1,{workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract/core',langPath:'/vendor/tesseract/lang'});
    try{const result=await worker.recognize(canvas);return [{text:result.data.text||'',source:'ocr'}];}finally{await worker.terminate();}
  }catch{return [{text:'',source:'ocr',warnings:['Local OCR is unavailable on this device. You can enter booking details manually.']}];}
}

async function readBarcodes(blob:Blob):Promise<BarcodeExtraction[]>{return readCanvasBarcodes(await blobCanvas(blob));}
async function readCanvasBarcodes(canvas:HTMLCanvasElement):Promise<BarcodeExtraction[]>{
  const Detector=(globalThis as any).BarcodeDetector;
  if(Detector){try{const rows=await new Detector({formats:['qr_code','aztec','pdf417','data_matrix']}).detect(canvas);if(rows.length)return rows.slice(0,10).map((x:any)=>({value:String(x.rawValue||'').slice(0,2000),format:String(x.format||'')})).filter((x:BarcodeExtraction)=>x.value);}catch{}}
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)return[];const data=context.getImageData(0,0,canvas.width,canvas.height),qr=jsQR(data.data,data.width,data.height,{inversionAttempts:'attemptBoth'});return qr?.data?[{value:qr.data.slice(0,2000),format:'qr_code'}]:[];
}
async function blobCanvas(blob:Blob):Promise<HTMLCanvasElement>{const bitmap=await createImageBitmap(blob),scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas;}

function emailText(raw:string):string{const split=raw.search(/\r?\n\r?\n/),headers=split>=0?raw.slice(0,split):'',body=split>=0?raw.slice(split):raw;return `${headers.match(/^(?:From|Subject|Date):.*$/gim)?.join('\n')||''}\n${stripMarkup(body.replace(/=\r?\n/g,''))}`;}
function calendarText(raw:string):string{return raw.replace(/\r?\n[ \t]/g,'').split(/\r?\n/).filter(line=>/^(SUMMARY|DESCRIPTION|LOCATION|DTSTART|DTEND|UID|ORGANIZER|URL)[:;]/i.test(line)).map(line=>line.replace(/^[^:]+:/,'')).join('\n');}
function docxText(bytes:Uint8Array):string{const zip=safeZip(bytes),xml=zip['word/document.xml'];if(!xml)throw new Error('DOCX document content is unavailable.');return stripMarkup(strFromU8(xml).replace(/<w:tab\/>/g,' ').replace(/<\/w:p>/g,'\n'));}
function pkpassText(bytes:Uint8Array):string{const zip=safeZip(bytes),file=zip['pass.json'];if(!file)throw new Error('Apple Wallet pass content is unavailable.');const pass=JSON.parse(strFromU8(file));const values:string[]=[];for(const key of ['description','organizationName','logoText','serialNumber','relevantDate'])if(typeof pass[key]==='string')values.push(pass[key]);for(const group of ['headerFields','primaryFields','secondaryFields','auxiliaryFields','backFields'])for(const item of pass.boardingPass?.[group]||pass.eventTicket?.[group]||pass.generic?.[group]||pass[group]||[])if(item&&typeof item==='object')values.push(String(item.label||''),String(item.value||''));if(pass.barcode?.message)values.push(String(pass.barcode.message));return values.join('\n');}
function safeZip(bytes:Uint8Array):Record<string,Uint8Array>{let count=0,total=0;const files=unzipSync(bytes,{filter:(file)=>{count++;total+=file.originalSize;if(count>500||total>20*1024*1024)throw new Error('Archive expands beyond the safe local limit.');return !file.name.includes('..')&&!file.name.startsWith('/')&&file.originalSize<5*1024*1024;}});return files;}
function stripMarkup(value:string):string{const doc=new DOMParser().parseFromString(value,'text/html');return (doc.body.textContent||'').replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();}

(globalThis as any).TriptoSmartImport={recognizeFile};
