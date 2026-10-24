import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseCSV,summary,decodeCSV} from '../web/core.js';
if(!process.argv[2])throw Error('Pass the source CSV path');
const solves=parseCSV(decodeCSV(await readFile(process.argv[2])));
await mkdir('data',{recursive:true});
await writeFile('data/seed.json',JSON.stringify(solves));
console.log(JSON.stringify({count:solves.length,all:summary([...solves].reverse())},null,2));
