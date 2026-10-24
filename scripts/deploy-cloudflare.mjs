import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(!config.account_id||!config.d1_databases?.[0]?.database_id)throw Error('Configure the Cloudflare account and D1 database first.');
const run=(args)=>{const result=spawnSync(process.execPath,args,{stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});if(result.status!==0)process.exit(result.status||1);};
run(['scripts/build-cloudflare.mjs']);
run(['node_modules/wrangler/bin/wrangler.js','d1','migrations','apply','cube-studio','--remote']);
run(['node_modules/wrangler/bin/wrangler.js','deploy']);
