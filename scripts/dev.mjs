import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';
import {generateIcons} from './icons.mjs';
import {readPrivateSeed} from './private-seed.mjs';
await mkdir('.local',{recursive:true});
await generateIcons('.local/icons');
const db=new DatabaseSync('.local/solves.sqlite');
db.exec('CREATE TABLE IF NOT EXISTS solves (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)');
const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){db.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.run()));db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}}};
const seed=await readPrivateSeed();
for(const s of seed) db.prepare('INSERT OR IGNORE INTO solves VALUES(?,?,?,0)').run(s.id,JSON.stringify(s),s.updatedAt);
const paths={'/':'web/index.html','/style.css':'web/style.css','/dark.css':'web/dark.css','/app.js':'web/app.js','/motion.js':'web/motion.js','/mobile-navigation.js':'web/mobile-navigation.js','/core.js':'web/core.js','/cube.js':'web/cube.js','/lessons.js':'web/lessons.js','/lesson-view.js':'web/lesson-view.js','/lesson-cube.js':'web/lesson-cube.js','/lessons.css':'web/lessons.css','/split-charts.js':'web/split-charts.js','/solve-feedback.js':'web/solve-feedback.js','/pwa.js':'web/pwa.js','/connect.js':'web/connect.js','/sw.js':'web/sw.js','/manifest.webmanifest':'web/manifest.webmanifest','/icons/icon-180.png':'.local/icons/icon-180.png','/icons/icon-192.png':'.local/icons/icon-192.png','/icons/icon-512.png':'.local/icons/icon-512.png'};
const types={html:'text/html',css:'text/css',js:'text/javascript',webmanifest:'application/manifest+json',png:'image/png'};
async function asset(path){
  const content=await readFile(path);
  if(path!=='web/sw.js')return content;
  const hash=createHash('sha256');
  for(const file of [...new Set(Object.values(paths))].sort())hash.update(file).update(await readFile(file));
  return content.toString().replace('__VERSION__',hash.digest('hex').slice(0,16));
}
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost:5188');if(paths[url.pathname]){const p=paths[url.pathname];res.writeHead(200,{'content-type':types[p.split('.').pop()]+'; charset=utf-8','cache-control':'no-store'});return res.end(await asset(p));}const chunks=[];for await(const c of req)chunks.push(c);const request=new Request(url,{method:req.method,headers:req.headers,...(req.method!=='GET'&&req.method!=='HEAD'?{body:Buffer.concat(chunks)}:{})});const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(e){console.error(e);res.writeHead(500);res.end('Server error');}}).listen(5188,'0.0.0.0',()=>console.log('Cube Studio: http://localhost:5188'));
