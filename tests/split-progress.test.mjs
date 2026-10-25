import {test} from 'node:test';
import assert from 'node:assert/strict';
import {splitProgress,splitComparisons} from '../web/core.js';

function solve(index,firstSeconds=5){return {id:'solve-'+index,date:new Date(Date.UTC(2026,9,20,index)).toISOString(),ms:(firstSeconds+10)*1000,penalty:'none',splits:[{name:'Cross',ms:firstSeconds*1000},{name:'Rest',ms:(firstSeconds+10)*1000}]};}
const labels=['Cross','Rest'];

test('split means start on the first recorded point even without earlier matching history',()=>{
  const progress=splitProgress([2,4,6,8,10,12].map((seconds,i)=>solve(i,seconds)),labels);
  assert.deepEqual(progress.series[0].points.map(p=>p.mean5),[2000,3000,4000,5000,6000,8000]);
  assert.deepEqual(progress.series[0].points.map(p=>p.meanCount),[1,2,3,4,5,5]);
});
test('split progress uses individual durations and a full five-solve mean in chronological order',()=>{
  const a=[5,4,3,2,1,6].map((n,i)=>solve(i,n)).reverse();
  const result=splitProgress(a,labels);
  assert.equal(result.count,6);
  assert.deepEqual(result.series[0].points.map(p=>p.ms),[5000,4000,3000,2000,1000,6000]);
  assert.deepEqual(result.series[0].points.map(p=>p.mean5),[5000,4500,4000,3500,3000,3200]);
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
  assert.deepEqual(result.series[0].points,[{id:base.id,date:base.date,ms:5000,mean5:5000,meanCount:1}]);
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

test('filtered split means use preceding matching history without adding hidden points or changing visible summaries',()=>{
  const history=[100,90,80,70,60,2,1].map((seconds,i)=>solve(i,seconds)),visible=history.slice(-2);
  const progress=splitProgress(visible,labels,history);
  assert.equal(progress.count,2);
  assert.deepEqual(progress.series[0].points.map(p=>p.id),visible.map(s=>s.id));
  assert.deepEqual(progress.series[0].points.map(p=>p.mean5),[60400,42600]);
  assert.equal(progress.means[0],1500,'Summary only describes visible splits');
  assert.equal(progress.maxMs,60400,'Scale includes visible rolling means influenced by hidden history');
  const withInvalid=[...history.slice(0,5),{...solve(8,200),date:history[4].date,penalty:'dnf'}, {...solve(9,300),date:history[4].date,splits:[]},...visible];
  assert.deepEqual(splitProgress(visible,labels,withInvalid),progress,'Ineligible prior splits never enter the rolling window');
  assert.equal(splitProgress(history.slice(0,2),labels,history).series[0].points[0].mean5,100000,'Future solves cannot enter an earlier point');
});

test('split comparisons report percentage and seconds from group means, keeping step penalties separate',()=>{
  const previous=[solve(0,8),solve(1,12)],current=[solve(2,5),solve(3,10)];
  const comparison=splitComparisons(current,previous,labels);
  assert.deepEqual(comparison[0],{percent:-25,tone:'good',deltaMs:-2500,currentMean:7500,previousMean:10000});
  assert.deepEqual(comparison[1],{percent:0,tone:'neutral',deltaMs:0,currentMean:10000,previousMean:10000});
  const slower=splitComparisons(previous,current,labels)[0];
  assert.equal(slower.tone,'bad');assert.equal(slower.deltaMs,2500);
  assert.deepEqual(splitComparisons(current.map(s=>({...s,penalty:'+2'})),previous,labels),comparison);
});

test('split comparisons omit missing, incompatible, DNF and zero baselines',()=>{
  const current=[solve(1,5)];
  for(const previous of [[],[{...solve(0),penalty:'dnf'}],[{...solve(0),splits:[]}]] ){
    assert.deepEqual(splitComparisons(current,previous,labels),[null,null]);
  }
  assert.deepEqual(splitComparisons([],current,labels),[null,null]);
  assert.equal(splitComparisons(current,[solve(0,0)],labels)[0],null);
  assert.equal(splitComparisons([solve(1,0)],current,labels)[0].percent,-100);
});
