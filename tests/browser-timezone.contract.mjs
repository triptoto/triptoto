import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('public/mobile-app.js','utf8');
const start=source.indexOf('function resolveEventLocalDateTime');
const end=source.indexOf('async function createMobileLocation',start);
if(start<0||end<0)throw new Error('Product V2 timezone converter was not found.');
const context={Intl,Date,Error};
vm.createContext(context);
vm.runInContext(source.slice(start,end),context);

const exact=context.resolveEventLocalDateTime('2027-06-01T10:00','Europe/Rome');
if(!Number.isFinite(exact))throw new Error('Product V2 converter rejected an exact local time.');
for(const value of ['2027-03-28T02:30','2027-10-31T02:30']){
  let rejected=false;
  try{context.resolveEventLocalDateTime(value,'Europe/Rome');}catch{rejected=true;}
  if(!rejected)throw new Error(`Product V2 converter silently accepted DST edge ${value}.`);
}
console.log('Browser timezone contract passed.');
