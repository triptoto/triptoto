import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = readFileSync('public/mobile-app.js','utf8');
const context = vm.createContext({ Intl, Map, JSON });
vm.runInContext(source.slice(source.indexOf('  const dateFormatters'),source.indexOf('  const API =')),context);
const options={timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hour12:false};
assert.equal(context.dateFormatter('en-GB',options),context.dateFormatter('en-GB',{...options}));
for(const instant of ['2026-03-29T00:30Z','2026-03-29T01:30Z','2026-10-25T01:30Z']){
 assert.equal(context.dateFormatter('en-GB',options).format(new Date(instant)),new Intl.DateTimeFormat('en-GB',options).format(new Date(instant)));
}
assert.throws(()=>context.dateFormatter('en',{timeZone:'invalid-zone'}),RangeError);
for(let i=0;i<200;i++)context.dateFormatter(`en-x-${i}`,{year:'numeric'});
assert.equal(vm.runInContext('dateFormatters.size',context),128);
let renders=0, binds=0, insertions=0, removedToasts=0;
const background={setAttribute(){}};
const app={querySelector:selector=>selector==='.phone-app'?background:{remove(){removedToasts++;}},insertAdjacentHTML(){insertions++;}};
Object.assign(context,{state:{sheet:null,screen:'form'},document:{activeElement:null,getElementById:()=>app,documentElement:{classList:{add(){},remove(){}}}},focusKeyFor:()=>null,render:()=>renders++,sheetContent:()=>'<section class="bottom-sheet"></section>',bindDynamic:()=>binds++,ensureStay22:()=>Promise.resolve(),toast:()=>'<div class="toast-mobile">Saved</div>'});
vm.runInContext('let sheetReturnFocus=null;'+source.slice(source.indexOf('  function openSheet('),source.indexOf('  function closeSheet()')),context);
context.openSheet('document');assert.equal(renders,0,'Opening a popup must not rebuild its background');assert.equal(binds,1);assert.equal(insertions,1);
context.openSheet('driver');assert.equal(renders,1,'Full-screen transitions retain the full render path');
vm.runInContext(source.slice(source.indexOf('  function renderToast()'),source.indexOf('  function render()')),context);
context.renderToast();assert.equal(renders,1,'Toast does not rebuild screen');assert.equal(removedToasts,1);assert.equal(insertions,2);
console.log('Render performance: formatter reuse/output, invalid zones, overlay preservation, full-screen fallback and isolated toasts passed.');

assert(source.includes('event.target.closest("button,a,input,select,textarea")'),'Sheet dragging must not swallow control clicks');
