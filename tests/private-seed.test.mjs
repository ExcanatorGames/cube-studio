import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readPrivateSeed} from '../scripts/private-seed.mjs';

test('public checkouts work without private history and malformed imports remain visible',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'cube-studio-seed-')),path=join(dir,'seed.json');
  try{
    assert.deepEqual(await readPrivateSeed(path),[]);
    await writeFile(path,JSON.stringify([{id:'example',ms:45000}]));assert.deepEqual(await readPrivateSeed(path),[{id:'example',ms:45000}]);
    await writeFile(path,'not JSON');await assert.rejects(readPrivateSeed(path),SyntaxError);
  }finally{await rm(dir,{recursive:true,force:true});}
});
