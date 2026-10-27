import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../worker/index.js';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE solves(id TEXT PRIMARY KEY,data TEXT,updated_at INTEGER,deleted INTEGER)');
db.exec('CREATE TABLE IF NOT EXISTS lesson_attempts (id TEXT PRIMARY KEY NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);');
db.exec(readFileSync(new URL('../drizzle/0003_incremental_sync.sql', import.meta.url), 'utf8'));
const env={DB:{prepare(sql){let values=[];return {bind(...v){values=v;return this;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return db.prepare(sql).run(...values);}};},async batch(a){return Promise.all(a.map(x=>x.run()));}}};
const solve={id:'test-solve',date:'2026-10-24T18:00:00Z',ms:45000,penalty:'none',scramble:'R U2',trust:'confirmed',usedScramble:true,splits:[],updatedAt:Date.now()-10000};
const get=()=>worker.fetch(new Request('http://localhost/api/solves'),env);
const post=solves=>worker.fetch(new Request('http://localhost/api/solves',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({solves})}),env);

test('change cursors page history, replay late clock-skewed edits and tombstones, and exclude unchanged rows', async () => {
  const load = async cursor => (await (await worker.fetch(new Request(`http://localhost/api/solves?cursor=${cursor}`), env)).json());
  const batch = Array.from({length: 370}, (_, i) => ({...solve, id:`page-${i}`, updatedAt:1000}));
  await post(batch);
  const first = await load(0);
  assert.equal(first.solves.length, 350);
  assert.equal(first.hasMore, true);
  const second = await load(first.cursor);
  assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.solves, ...second.solves].map(s => s.id)).size, 370);
  const empty = await load(second.cursor);
  assert.deepEqual(empty.solves, []);
  assert.equal(empty.cursor, second.cursor);
  await post([{...batch[0], updatedAt:1001, deleted:true}]);
  const deletion = await load(second.cursor);
  assert.equal(deletion.solves.length, 1);
  assert.equal(deletion.solves[0].deleted, true);
  await post([batch[0]]); // A rejected stale write must not create a change.
  assert.deepEqual((await load(deletion.cursor)).solves, []);
  await post([{...batch[0], updatedAt:1002, deleted:false}]);
  assert.equal((await load(deletion.cursor)).solves[0].deleted, false);
  assert.equal((await worker.fetch(new Request('http://localhost/api/solves?cursor=-1'),env)).status,400);
  // Keep the legacy API tests independent of this generated history.
  db.exec("DELETE FROM solves WHERE id LIKE 'page-%'; DELETE FROM sync_changes WHERE id LIKE 'page-%'");
});

test('lesson sync validates metadata, remains separate from normal solves and preserves newer versions', async () => {
  const lesson = { ...solve, id: 'lesson-test', lessonId: '13', caseId: 'ready-right', completion: 'insertion' };
  const send = values => worker.fetch(new Request('http://localhost/api/lesson-attempts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ solves: values }) }), env);
  const load = async () => (await (await worker.fetch(new Request('http://localhost/api/lesson-attempts'), env)).json()).solves;
  assert.equal((await send([{ ...lesson, caseId: '' }])).status, 400);
  assert.equal((await post([lesson])).status, 400);
  assert.equal((await send([lesson])).status, 200);
  const newer = { ...lesson, updatedAt: lesson.updatedAt + 10, note: 'Practice progress', deleted: true };
  await send([newer]); await send([lesson]);
  assert.deepEqual(await load(), [newer]);
  assert.ok(!(await (await get()).json()).solves.some(s => s.id === lesson.id));
});
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
