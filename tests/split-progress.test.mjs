import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitProgress} from '../web/core.js';

function solve(index,firstSeconds=5){return {id:'solve-'+index,date:new Date(Date.UTC(2026,9,20,index)).toISOString(),ms:(firstSeconds+10)*1000,penalty:'none',splits:[{name:'Cross',ms:firstSeconds*1000},{name:'Rest',ms:(firstSeconds+10)*1000}]};}
const labels=['Cross','Rest'];
test('split progress uses individual durations and a full five-solve mean in chronological order',()=>{
  const a=[5,4,3,2,1,6].map((n,i)=>solve(i,n)).reverse();
  const result=splitProgress(a,labels);
  assert.equal(result.count,6);
  assert.deepEqual(result.series[0].points.map(p=>p.ms),[5000,4000,3000,2000,1000,6000]);
  assert.deepEqual(result.series[0].points.map(p=>p.mean5),[null,null,null,null,3000,3200]);
  assert.ok(result.series[1].points.every(p=>p.ms===10000));
  assert.equal(result.means[0],3500);
  assert.equal(result.means[1],10000);
  assert.equal(result.maxMs,10000);
  assert.equal(result.series[0].points[5].id,'solve-5');
  assert.equal(a[0].id,'solve-5','input order must remain unchanged');
});
test('split progress separates methods and excludes missing, incomplete, invalid and DNF records',()=>{
  const base=solve(0);
  const invalid=[{...base,splits:[]},{...base,splits:[{name:'Cross',ms:5000}]},{...base,splits:[{name:'Different',ms:5000},base.splits[1]]},{...base,ms:16000},{...base,penalty:'dnf'},{...base,deleted:true},{...base,date:'invalid'},{...base,splits:[{name:'Cross',ms:16000},{name:'Rest',ms:15000}]}];
  const result=splitProgress([...invalid,base],labels);
  assert.equal(result.count,1);
  assert.deepEqual(result.series[0].points,[{id:base.id,date:base.date,ms:5000,mean5:null}]);
  assert.equal(splitProgress(invalid,labels).count,0);
});
test('a solve-level +2 is not assigned to a step and absent split data is never fabricated',()=>{
  const result=splitProgress([{...solve(0),penalty:'+2'}],labels);
  assert.deepEqual(result.means,[5000,10000]);
  const empty=splitProgress([{...solve(0),splits:[]}],labels);
  assert.equal(empty.count,0);
  assert.deepEqual(empty.series.map(s=>s.points),[[],[]]);
  assert.deepEqual(empty.means,[null,null]);
  assert.equal(splitProgress([solve(0)],[]).count,0);
});
