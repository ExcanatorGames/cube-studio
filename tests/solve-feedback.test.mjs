import {test} from 'node:test';
import assert from 'node:assert/strict';
import {solveFeedback} from '../web/core.js';
const solve=(i,ms=50000,extra={})=>({id:'s-'+String(i).padStart(3,'0'),date:new Date(Date.UTC(2026,9,20,0,i)).toISOString(),ms,penalty:'none',trust:'confirmed',usedScramble:true,splits:[],...extra});
test('feedback compares against the previous 50 and ranks the current solve once in all eligible history',()=>{
  const history=Array.from({length:60},(_,i)=>solve(i,40000+i*1000)),current=solve(60,55000),input=[current,...history].reverse();
  const f=solveFeedback(input,current);
  assert.equal(f.recent.length,50);assert.equal(f.median,74500);assert.equal(f.delta,-19500);assert.equal(f.best,40000);assert.equal(f.pbDelta,15000);
  assert.equal(f.rank,16);assert.equal(f.count,61);assert.equal(f.recentRank,6);assert.equal(f.percent,88);assert.equal(f.tone,'good');assert.equal(f.isPB,false);
  assert.equal(input[0].id,'s-059','input must not be sorted in place');
});
test('deleted, DNF and future solves do not distort a solve-time comparison; +2 and ties count correctly',()=>{
  const prior=solve(0,50000),penalized=solve(1,48000,{penalty:'+2'}),current=solve(5,50000);
  const ignored=[solve(3,1,{deleted:true}),solve(4,1,{penalty:'dnf'}),solve(8,1)];
  const f=solveFeedback([prior,penalized,current,...ignored],current);
  assert.equal(f.rank,1);assert.equal(f.count,3);assert.equal(f.delta,0);assert.equal(f.isPB,false);assert.equal(f.tone,null);assert.equal(f.percent,0);
  const p=solveFeedback([prior],{...current,ms:49000,penalty:'+2'});assert.equal(p.ms,51000);assert.equal(p.delta,1000);assert.equal(p.rank,2);
  assert.equal(solveFeedback([prior],{...current,penalty:'dnf'}),null);
});
test('legacy scramble flags never exclude totals, recent comparisons or split baselines',()=>{
  const steps=(first,total)=>[{name:'Cross',ms:first},{name:'Rest',ms:total}];
  const history=[solve(0,40000,{trust:'uncertain',usedScramble:false,splits:steps(8000,40000)}),solve(1,60000,{trust:'assumed',splits:steps(12000,60000)})];
  const current=solve(2,50000,{trust:'uncertain',usedScramble:false,splits:steps(9000,50000)}),f=solveFeedback(history,current);
  assert.equal(f.count,3);assert.equal(f.rank,2);assert.equal(f.recent.length,2);assert.equal(f.median,50000);assert.equal(f.best,40000);assert.equal(f.isPB,false);assert.equal(f.splits[0].median,10000);assert.equal(f.splits[0].delta,-1000);assert.equal(f.splits[0].count,2);
});
test('first observations have no invented comparison or personal best',()=>{
  const current=solve(0),f=solveFeedback([current],current);
  assert.equal(f.rank,1);assert.equal(f.count,1);assert.equal(f.median,null);assert.equal(f.delta,null);assert.equal(f.best,null);assert.equal(f.isPB,false);assert.equal(f.percent,null);assert.deepEqual(f.recent,[]);
  const second=solveFeedback([current],solve(1,49000));assert.equal(second.isPB,true);assert.equal(second.tone,'gold');assert.equal(second.pbDelta,-1000);
});
test('split medians and personal bests use raw durations and only complete matching sequences',()=>{
  const steps=(first,total)=>[{name:'Cross',ms:first},{name:'Rest',ms:total}];
  const history=[solve(0,50000,{splits:steps(10000,50000)}),solve(1,48000,{penalty:'+2',splits:steps(8000,48000)}),solve(2,1000,{splits:[{name:'Different',ms:500},{name:'Rest',ms:1000}]}),solve(3,45000,{splits:steps(500,40000)}),solve(4,60000)];
  const current=solve(5,47000,{penalty:'+2',splits:steps(7000,47000)}),f=solveFeedback(history,current);
  assert.deepEqual(f.splits.map(s=>({ms:s.ms,median:s.median,delta:s.delta,best:s.best,isPB:s.isPB,count:s.count})),[{ms:7000,median:9000,delta:-2000,best:8000,isPB:true,count:2},{ms:40000,median:40000,delta:0,best:40000,isPB:false,count:2}]);
  assert.equal(f.ms,49000);assert.equal(f.splits[0].tone,'gold');assert.equal(f.splits[1].tone,null);
  const alone=solveFeedback([],current);assert.ok(alone.splits.every(s=>s.median===null&&s.delta===null&&!s.isPB));
});
