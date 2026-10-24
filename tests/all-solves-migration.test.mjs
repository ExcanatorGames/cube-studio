import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';

test('history normalization preserves every solve field and split, advances sync timestamps, and is idempotent',async()=>{
  const sql=await readFile(new URL('../drizzle/0001_all_solves_equal.sql',import.meta.url),'utf8');
  const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE solves(id TEXT PRIMARY KEY,data TEXT,updated_at INTEGER,deleted INTEGER)');
  const records=[
    {id:'corrected',ms:69347,trust:'uncertain',usedScramble:false,splits:[{name:'Match edges',ms:46070},{name:'Position corners',ms:57947},{name:'Twist corners',ms:69347}],note:'Keep this solve',updatedAt:1000},
    {id:'import',ms:35850,trust:'assumed',usedScramble:true,penalty:'+2',scramble:'R U',updatedAt:2000},
    {id:'deleted',ms:50000,trust:'uncertain',usedScramble:false,penalty:'dnf',deleted:true,updatedAt:3000},
    {id:'already-equal',ms:45000,trust:'confirmed',usedScramble:true,updatedAt:4000}
  ];
  for(const s of records)db.prepare('INSERT INTO solves VALUES(?,?,?,?)').run(s.id,JSON.stringify(s),s.updatedAt,s.deleted?1:0);
  db.exec(sql);const rows=db.prepare('SELECT * FROM solves ORDER BY id').all();assert.equal(rows.length,records.length);
  for(const row of rows){const after=JSON.parse(row.data),before=records.find(s=>s.id===row.id);assert.deepEqual(after,{...before,trust:'confirmed',usedScramble:true,updatedAt:after.updatedAt});assert.equal(after.updatedAt,row.updated_at);assert.equal(row.deleted,before.deleted?1:0);assert.equal(after.usedScramble,true);if(before.trust==='confirmed')assert.equal(after.updatedAt,before.updatedAt);else assert.ok(after.updatedAt>before.updatedAt);}
  db.exec(sql);assert.deepEqual(db.prepare('SELECT * FROM solves ORDER BY id').all(),rows);db.close();
});
