import fs from 'node:fs';

const indexPath='apps/worker/src/index.ts';
let index=fs.readFileSync(indexPath,'utf8');
index=index.replace("import { appUi } from './ui.ts';\n",'');
index=index.replace(/\n\s*if \(request\.method === 'GET' && \(path === '\/' \|\| path === '\/app'\)\) return appUi\(request, env\);/g,'');
fs.writeFileSync(indexPath,index);
if(fs.existsSync('apps/worker/src/ui.ts'))fs.rmSync('apps/worker/src/ui.ts');
for(const old of ['scripts/apply-ui-v1.mjs','COPY_MANUALLY_UI_V1.md','README_UI_V1.md']){if(fs.existsSync(old))fs.rmSync(old);}

const wranglerPath='wrangler.jsonc';
const wrangler=JSON.parse(fs.readFileSync(wranglerPath,'utf8'));
wrangler.assets={
  directory:'./public',
  not_found_handling:'single-page-application',
  run_worker_first:['/api/*','/health']
};
fs.writeFileSync(wranglerPath,JSON.stringify(wrangler,null,2)+'\n');

const packagePath='package.json';
const pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
pkg.scripts=pkg.scripts||{};
pkg.scripts['check:ui']='node --check public/app.js';
fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n');
console.log('Frontend Foundation v2 installed. Static assets configured; broken ui.ts removed.');
