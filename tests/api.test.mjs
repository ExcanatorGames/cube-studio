import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE solves(id TEXT PRIMARY KEY,data TEXT,updated_at INTEGER,deleted INTEGER)');
const env={DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);}};},async batch(a){return Promise.all(a.map(x=>x.run()));}}};
const solve={id:'test-solve',date:'2026-10-24T18:00:00Z',ms:45000,penalty:'none',scramble:'R U2',trust:'confirmed',usedScramble:true,splits:[],updatedAt:Date.now()-10000};
const get=()=>worker.fetch(new Request('http://localhost/api/solves'),env);
const post=solves=>worker.fetch(new Request('http://localhost/api/solves',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({solves})}),env);
test('API persists new solves, newer edits, deletion and undo without stale overwrites',async()=>{assert.equal((await post([solve])).status,200);assert.equal((await (await get()).json()).solves[0].ms,45000);await post([{...solve,penalty:'+2',updatedAt:solve.updatedAt+10}]);await post([solve]);assert.equal((await (await get()).json()).solves[0].penalty,'+2');await post([{...solve,deleted:true,updatedAt:solve.updatedAt+20}]);assert.equal((await (await get()).json()).solves[0].deleted,true);await post([{...solve,deleted:false,updatedAt:solve.updatedAt+30}]);assert.equal((await (await get()).json()).solves[0].deleted,false);});
test('API rejects bad batches, cross-origin writes and unsupported content types',async()=>{assert.equal((await post([{...solve,ms:-10}])).status,400);assert.equal((await worker.fetch(new Request('http://localhost/api/solves',{method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:'{}'}),env)).status,403);assert.equal((await worker.fetch(new Request('http://localhost/api/solves',{method:'POST',body:'{}'}),env)).status,415);});

test('old clients and old stored rows always return and save equal-standing history',async()=>{
  const legacy={...solve,id:'legacy-solve',trust:'uncertain',usedScramble:false,note:'Keep this',splits:[{name:'Cross',ms:9000},{name:'Rest',ms:45000}]};
  db.prepare('INSERT INTO solves VALUES(?,?,?,0)').run(legacy.id,JSON.stringify(legacy),legacy.updatedAt);
  const fromGet=(await (await get()).json()).solves.find(s=>s.id===legacy.id);
  assert.deepEqual(fromGet,{...legacy,trust:'confirmed',usedScramble:true});
  const edit={...legacy,updatedAt:legacy.updatedAt+100};assert.equal((await post([edit])).status,200);
  assert.deepEqual(JSON.parse(db.prepare('SELECT data FROM solves WHERE id=?').get(legacy.id).data),{...edit,trust:'confirmed',usedScramble:true});
});
