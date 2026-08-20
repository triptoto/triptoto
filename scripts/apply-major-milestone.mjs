import { readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const keep=new Set(['COPY_MAJOR_BETA_MILESTONE_5_8.md']);
for(const name of await readdir('.')){
  if(/^COPY_.*\.md$/.test(name)&&!keep.has(name))await unlink(resolve(name)).catch(()=>{});
}
console.log('Major milestone cleanup complete. Existing trip data and configuration were not modified.');
