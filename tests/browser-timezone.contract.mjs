import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/app.js','utf8');
const start=source.indexOf('function resolveBrowserLocalDateTime');
const end=source.indexOf('function utcToLocalInput',start);
if(start<0||end<0)throw new Error('Browser timezone converter was not found.');
const context={Intl,Date,Error};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);

const exact=context.resolveBrowserLocalDateTime('2027-06-01T10:00','Europe/Rome');
const gap=context.resolveBrowserLocalDateTime('2027-03-28T02:30','Europe/Rome');
const overlap=context.resolveBrowserLocalDateTime('2027-10-31T02:30','Europe/Rome');
if(exact.status!=='exact'||exact.candidatesUtc.length!==1)throw new Error('Browser converter rejected an exact local time.');
if(gap.status!=='invalid'||gap.candidatesUtc.length!==0)throw new Error('Browser converter accepted a DST spring gap.');
if(overlap.status!=='ambiguous'||overlap.candidatesUtc.length!==2)throw new Error('Browser converter silently selected a DST autumn overlap.');
let rejected=false;
try{context.localToUtc('2027-10-31T02:30','Europe/Rome');}catch{rejected=true;}
if(!rejected)throw new Error('Browser form did not reject an ambiguous local time.');
console.log('Browser timezone contract passed.');
