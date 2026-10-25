import {test} from 'node:test';
import assert from 'node:assert/strict';
import {insightPeriods,metricChange,summary,timeExtremes,result,solveDistribution} from '../web/core.js';
import {harness} from './helpers/app-harness.mjs';

const now=new Date(2026,9,25,12).getTime(),day=86400000;
const solve=(id,days,ms=60000,penalty='none')=>({id,date:new Date(now-days*day).toISOString(),ms,penalty,splits:[]});

test('solve-count filters select adjacent chronological groups regardless of dates and exclude invalid rows',()=>{
  const solves=[solve('now',0),solve('start',30),solve('previous',60),solve('outside',61),solve('future',-1),{...solve('deleted',1),deleted:true},{...solve('invalid',1),date:'invalid'}];
  const periods=insightPeriods(solves,'2',now);
  assert.deepEqual(periods.current.map(s=>s.id),['start','now']);
  assert.deepEqual(periods.previous.map(s=>s.id),['outside','previous']);
  assert.deepEqual(periods.view,periods.current);
  assert.equal(insightPeriods(solves,'200',now).previous.length,0);
  assert.equal(solves[0].id,'now');
  const partial=insightPeriods(solves,'3',now);
  assert.deepEqual(partial.previous.map(s=>s.id),['outside']);
  assert.equal(partial.label,'Last 3 solves vs previous 1 solve');
  const attempts=Array.from({length:450},(_,i)=>solve(String(i),450-i,40000,i%10===0?'dnf':'none'));
  for(const count of [200,100,50,20,10,5]){
    const selected=insightPeriods(attempts,String(count),now);
    assert.equal(selected.current.length,count);
    assert.equal(selected.previous.length,count);
    assert.equal(selected.current[0].id,String(450-count));
    assert.equal(selected.previous.at(-1).id,String(449-count));
  }
});

test('all-time cards retain all history and compare the last four calendar months with the preceding four',()=>{
  const date=(id,month,day=25)=>({...solve(id,0),date:new Date(2026,month,day,12).toISOString()});
  const periods=insightPeriods([date('old',0),date('previous-start',1),date('current-start',5),date('recent',9)],'all',now);
  assert.equal(periods.view.length,4);
  assert.deepEqual(periods.current.map(s=>s.id),['current-start','recent']);
  assert.deepEqual(periods.previous.map(s=>s.id),['previous-start']);
  const monthEnd=new Date(2026,7,31,12).getTime();
  assert.equal(insightPeriods([{...solve('april-end',0),date:new Date(2026,3,30,12).toISOString()}],'all',monthEnd).current.length,1);
});

test('changes use lower times and higher success rates or activity as improvements, without invented baselines',()=>{
  assert.deepEqual(metricChange(45000,60000),{percent:-25,tone:'good'});
  assert.deepEqual(metricChange(75000,60000),{percent:25,tone:'bad'});
  assert.deepEqual(metricChange(50,40,{higherBetter:true}),{percent:25,tone:'good'});
  assert.equal(metricChange(20,40,{higherBetter:true}).tone,'bad');
  assert.equal(metricChange(60,60).tone,'neutral');
  for(const value of [0,null,Infinity,NaN])assert.equal(metricChange(50,value),null);
  assert.equal(metricChange(null,50),null);
  assert.equal(metricChange(Infinity,50),null);
  const stats=summary([solve('penalty',1,58000,'+2'),solve('dnf',2,30000,'dnf')]);
  assert.equal(stats.mean,60000);assert.equal(stats.sub60,0);assert.equal(stats.count,2);
});

test('chart extrema recalculate from the filtered penalized results, ignoring DNF and handling ties',()=>{
  const rows=[solve('old-fastest',40,10000),solve('old-slowest',45,120000),solve('fast',1,30000),solve('tied',2,28000,'+2'),solve('slow',3,70000),solve('dnf',4,5000,'dnf')];
  assert.deepEqual(timeExtremes(rows.map(result)),{fastest:10000,slowest:120000});
  const filtered=insightPeriods(rows,'4',now).view;
  assert.deepEqual(timeExtremes(filtered.map(result)),{fastest:30000,slowest:70000});
  assert.deepEqual(timeExtremes([Infinity,null,NaN]),{fastest:null,slowest:null});
  const h=harness();
  h.run(`records=new Map(${JSON.stringify(rows)}.map(s=>[s.id,s]));$('#insight-period').value='4';renderInsights()`);
  const chart=h.element('#main-chart').innerHTML;
  assert.match(chart,/class="solve-point fastest" data-id="fast"/);
  assert.match(chart,/class="solve-point fastest" data-id="tied"/);
  assert.match(chart,/class="solve-point slowest" data-id="slow"/);
  assert.doesNotMatch(chart,/data-id="old-|data-id="dnf"/);
  assert.match(h.element('#insight-comparison').textContent,/Last 4 solves/i);
  assert.match(h.element('#insight-stats').innerHTML,/stat-change good/);
});

test('stats omit missing comparison badges and hide the explanation when no metric has a baseline',()=>{
  const h=harness();
  h.run(`records=new Map(${JSON.stringify([solve('only',1,40000)])}.map(s=>[s.id,s]));$('#insight-period').value='20';renderInsights()`);
  assert.doesNotMatch(h.element('#insight-stats').innerHTML,/stat-change|No comparable baseline/);
  assert.equal(h.element('#insight-comparison').hidden,true);
  h.run(`records=new Map(${JSON.stringify(Array.from({length:10},(_,i)=>solve(String(i),10-i,i<5?60000:40000)))}.map(s=>[s.id,s]));$('#insight-period').value='5';renderInsights()`);
  const cards=h.element('#insight-stats').innerHTML;
  assert.match(cards,/stat-change good/);
  assert.doesNotMatch(cards,/No comparable baseline/);
  assert.equal((cards.match(/stat-change/g)||[]).length,5,'Only best, ao5, mean, median and solve count have valid comparisons');
  assert.equal(h.element('#insight-comparison').hidden,false);
});

test('filtered ao12 uses preceding history from the first displayed solve and keeps its values in view',()=>{
  const h=harness(),rows=Array.from({length:30},(_,i)=>solve(String(i),30-i,i<25?100000:40000));
  h.run(`records=new Map(${JSON.stringify(rows)}.map(s=>[s.id,s]));$('#insight-period').value='5';renderInsights()`);
  const svg=h.element('#main-chart').innerHTML;
  assert.match(svg,/<path class="solve-average-line" d="M44 /,'The rolling line starts at the first visible solve');
  assert.equal((svg.match(/data-id=/g)||[]).length,5,'Earlier solves are only calculation context');
  assert.match(svg,/105s<\/text>/,'The scale accommodates the warmed-up average above visible raw times');
  h.run(`records=new Map(${JSON.stringify(rows.slice(0,5))}.map(s=>[s.id,s]));renderInsights()`);
  assert.match(h.element('#main-chart').innerHTML,/<path class="solve-average-line" d=""/,'No invented average without twelve total solves');
});

test('distribution uses five-second intervals with exact boundaries, +2 penalties and empty gaps',()=>{
  const rows=[solve('a',7,39999),solve('b',2,40000),solve('c',3,44999),solve('d',4,50000),solve('plus-two',5,58000,'+2'),solve('dnf',6,1000,'dnf'),{...solve('deleted',8,80000),deleted:true}];
  const bins=solveDistribution(rows);
  assert.deepEqual(bins.map(bin=>bin.count),[1,2,0,1,0,1]);
  assert.ok(bins.every(bin=>bin.end-bin.start===5000));
  assert.equal(bins[0].label,'0:35–0:40');
  assert.equal(bins.at(-1).label,'1:00–1:05');
  assert.equal(bins.reduce((count,bin)=>count+bin.count,0),5);
  assert.deepEqual(solveDistribution([]),[]);
  const h=harness();
  h.run(`records=new Map(${JSON.stringify(rows)}.map(s=>[s.id,s]));$('#insight-period').value='5';renderInsights()`);
  assert.match(h.element('#distribution').innerHTML,/0:40–0:45/);
  assert.doesNotMatch(h.element('#distribution').innerHTML,/0:35–0:40/,'The distribution follows the selected solves');
});

test('split cards receive percentage and seconds comparisons for the same groups as the main stats',()=>{
  const h=harness(),rows=Array.from({length:10},(_,i)=>{
    const cross=i<5?10000:5000;
    return {...solve(String(i),i<5?150+i:10-i,20000),splits:[{name:'Cross',ms:cross},{name:'Rest',ms:20000}]};
  });
  h.run(`records=new Map(${JSON.stringify(rows)}.map(s=>[s.id,s]));settings.custom=['Cross','Rest'];$('#split-preset').value='custom';$('#insight-period').value='5';renderInsights()`);
  assert.equal(h.run('lastSplitProgress.comparisons[0].percent'),-50);
  assert.equal(h.run('lastSplitProgress.comparisons[0].deltaMs'),-5000);
  assert.equal(h.run('lastSplitProgress.comparisons[1].percent'),50);
  assert.equal(h.run('lastSplitProgress.comparisons[1].deltaMs'),5000);
  assert.equal(h.run('lastSplitProgress.comparisonLabel'),'Last 5 solves vs previous 5 solves');
  h.run("$('#insight-period').value='all';renderInsights()");
  assert.equal(h.run('lastSplitProgress.comparisons[0].percent'),-50);
  assert.equal(h.run('lastSplitProgress.comparisonLabel'),'Last 4 months vs previous 4 months');
});
