import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {hashSyncCode,syncConfigured,verifySyncCode} from '../worker/sync-code.js';
test('random sync codes authorize only the matching server-side hash',async()=>{const code=randomBytes(32).toString('base64url'),other=randomBytes(32).toString('base64url'),env={SYNC_CODE_HASH:await hashSyncCode(code)},request=x=>new Request('https://cube.example/api/solves',{headers:{authorization:'Bearer '+x}});assert.ok(syncConfigured(env));assert.equal(await verifySyncCode(request(code),env),true);assert.equal(await verifySyncCode(request(other),env),false);assert.equal(await verifySyncCode(request(code),{}),false);assert.equal(await verifySyncCode(new Request('https://cube.example/api/solves'),env),false);assert.equal(await verifySyncCode(request('short'),env),false);assert.equal(syncConfigured({SYNC_CODE_HASH:'wrong'}),false);});
