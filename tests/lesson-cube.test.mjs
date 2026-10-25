import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cubeStickers} from '../web/cube.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';

const options={orientation:'white-bottom',target:['1,-1,1','1,0,1']};
const projection=([x,y,z])=>[90+26*(x-z),92-30*y+13*(x+z)];
const polygons=svg=>new Map([...svg.matchAll(/data-sticker="([^"]+)" points="([^"]+)" fill="([^"]+)"/g)].map(([,id,points,fill])=>[id,{points:points.split(' ').map(p=>p.split(',').map(Number)),fill}]));
const center=points=>[0,1].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length);
const near=(actual,expected,tolerance=.011)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<tolerance,`${actual} should be near ${expected}`));

test('resting sticker colors, positions and marker identities match the authoritative cube model',()=>{
  const colors={U:'#f5d447',D:'#f4f4ef',F:'#29b875',R:'#ff942f',B:'#4285ec',L:'#e9474f'};
  for(const alg of ['',"R U R' U'","R U R' U' U R U' R'","F2 L D' B U2 R'"]){
    const svg=lessonCubeSVG(alg,options),visible=polygons(svg);
    const stickers=cubeStickers(alg).filter(s=>s.normal.some(n=>n===1));
    assert.equal(visible.size,27);
    for(const sticker of stickers){
      const polygon=visible.get(`${sticker.cubie}:${sticker.face}`);
      assert.ok(polygon);
      assert.equal(polygon.fill,colors[sticker.face]);
      near(center(polygon.points),projection(sticker.position.map((v,i)=>v+.5*sticker.normal[i])));
    }
    const targets=[...svg.matchAll(/data-target="([^"]+)" points="([^"]+)"/g)];
    assert.deepEqual(targets.map(m=>m[1]).sort(),stickers.filter(s=>options.target.includes(s.cubie)).map(s=>s.cubie).sort());
  }
});

test('intermediate frames rotate only the chosen layer, with markers attached and opaque internal faces',()=>{
  const alg="R U R' U'",initial=polygons(lessonCubeSVG(alg,options));
  const svg=lessonCubeSVG(alg,{...options,move:'U',progress:.5}),middle=polygons(svg);
  let moved=0,fixed=0;
  for(const sticker of cubeStickers(alg)){
    const id=`${sticker.cubie}:${sticker.face}`;
    if(!initial.has(id)||!middle.has(id))continue;
    if(sticker.position[1]!==1){assert.deepEqual(middle.get(id),initial.get(id));fixed++;}
    else if(JSON.stringify(middle.get(id))!==JSON.stringify(initial.get(id)))moved++;
  }
  assert.ok(fixed>=12);assert.ok(moved>=9);
  assert.notEqual(svg,lessonCubeSVG(alg+' U',options));
  assert.ok([...svg.matchAll(/<polygon points="[^"]+" fill="#10141c"/g)].length>27);
  for(const match of svg.matchAll(/data-sticker="([^"]+)" points="([^"]+)"[^>]+\/><polygon data-target="([^"]+)" points="([^"]+)"/g)){
    assert.ok(match[1].startsWith(match[3]+':'));
    near(center(match[2].split(' ').map(p=>p.split(',').map(Number))),center(match[4].split(' ').map(p=>p.split(',').map(Number))));
  }
});

test('all face turns, inverse turns and double turns approach and reach their canonical endpoints without a snap',()=>{
  const alg="F R U2 L' D B2";
  for(const face of 'URFDLB')for(const suffix of ['',"'",'2']){
    const move=face+suffix,end=lessonCubeSVG(alg+' '+move,options);
    assert.equal(lessonCubeSVG(alg,{...options,move,progress:1}),end);
    const almost=polygons(lessonCubeSVG(alg,{...options,move,progress:.999999}));
    for(const [id,polygon] of polygons(end)){
      assert.ok(almost.has(id),id);
      assert.equal(almost.get(id).fill,polygon.fill);
      for(const p of polygon.points)assert.ok(almost.get(id).points.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.02),`${move} endpoint corner continuity`);
    }
  }
});

test('the padded viewport is stable and contains every visible sticker throughout turns',()=>{
  const viewport=lessonCubeSVG().match(/viewBox="([^"]+)"/)[1];
  const [left,top,width,height]=viewport.split(' ').map(Number);
  for(const face of 'URFDLB')for(const suffix of ['',"'",'2'])for(const progress of [0,.1,.25,.5,.75,.9,1]){
    const svg=lessonCubeSVG('',{move:face+suffix,progress});
    assert.equal(svg.match(/viewBox="([^"]+)"/)[1],viewport);
    for(const polygon of polygons(svg).values())for(const [x,y] of polygon.points){
      assert.ok(x>=left&&x<=left+width&&y>=top&&y<=top+height,`${face+suffix} at ${progress}: ${x},${y} outside viewport`);
    }
  }
});
