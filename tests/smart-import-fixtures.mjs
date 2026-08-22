import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { classifyAndExtract } from '../packages/document-recognition/src/index.ts';
const root='tests/fixtures/smart-import',files=readdirSync(root).sort(),expected={
  'activity-html-artifacts.txt':'activity',
  'airline-forwarded.eml':'flight',
  'ambiguous-date.txt':'flight',
  'hotel-locale.txt':'hotel',
  'train.ics':'train',
};
for(const name of files){const result=classifyAndExtract([{text:readFileSync(join(root,name),'utf8'),source:name.endsWith('.ics')?'calendar':name.endsWith('.eml')?'email':'embedded_text'}]);if(result[0]?.type!==expected[name])throw new Error(`${name}: expected ${expected[name]}, got ${result[0]?.type||'none'}`);if(name==='ambiguous-date.txt'&&!result[0].warnings.some(w=>/ambiguous/i.test(w)))throw new Error('ambiguous fixture was guessed');}
console.log(`Smart Import fixture suite passed: ${files.length} realistic airline, hotel, train, activity and ambiguous-date inputs.`);
