import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cubeFaces,cubeSVG,scrambleLines,cubeStickers,cubeFrame,orientAlgorithm} from '../web/cube.js';

const solved=cubeFaces('');
test('scramble notation follows the selected U/F/R centers without changing the physical cube',()=>{
  const algorithms=[...'URFDLB'].flatMap(face=>[face,face+"'",face+'2']).concat(["R U F' D2 L' B",Array(3).fill("R U R' U' F2 D B'").join(' ')]);
  const rotate=([x,y,z])=>[-x,-y,z];
  const state=(algorithm,orientation,turned=false)=>cubeStickers(algorithm).map(sticker=>JSON.stringify({color:cubeFrame(orientation).colors[sticker.face],position:turned?rotate(sticker.position):sticker.position,normal:turned?rotate(sticker.normal):sticker.normal})).sort();
  for(const algorithm of algorithms){
    const bottom=orientAlgorithm(algorithm,'white-top','white-bottom');
    assert.deepEqual(state(bottom,'white-bottom'),state(algorithm,'white-top',true));
    assert.equal(orientAlgorithm(bottom,'white-bottom','white-top'),algorithm);
    assert.equal(orientAlgorithm(algorithm,'white-top','white-top'),algorithm);
  }
  assert.equal(orientAlgorithm("R U F' D2 L' B",'white-top','white-bottom'),"L D F' U2 R' B");
});
test('cube preview follows clockwise face turns from white top and green front',()=>{
  assert.deepEqual(cubeFaces('R').U,['U','U','F','U','U','F','U','U','F']);
  assert.deepEqual(cubeFaces('R').F,['F','F','D','F','F','D','F','F','D']);
  assert.deepEqual(cubeFaces('U').F,['R','R','R','F','F','F','F','F','F']);
  assert.deepEqual(cubeFaces('F').U,['U','U','U','U','U','U','L','L','L']);
  assert.deepEqual(cubeFaces('F').R,['U','R','R','U','R','R','U','R','R']);
});
test('scrambles preserve stickers, centers and cube group identities',()=>{
  for(const face of 'URFDLB'){
    assert.deepEqual(cubeFaces(`${face} ${face} ${face} ${face}`),solved);
    assert.deepEqual(cubeFaces(`${face} ${face}'`),solved);
    assert.deepEqual(cubeFaces(`${face}2 ${face}2`),solved);
  }
  assert.deepEqual(cubeFaces(Array(6).fill("R U R' U'").join(' ')),solved);
  const alg="R2 U' R2 B R' F' R D' R2 L2 U' B2 L2 U2 B2 U B2 D B2 R U2";
  const inverse=alg.split(' ').reverse().map(m=>m.endsWith('2')?m:m.endsWith("'")?m.slice(0,-1):m+"'").join(' ');
  assert.deepEqual(cubeFaces(alg+' '+inverse),solved);
  const scrambled=cubeFaces(alg),stickers=Object.values(scrambled).flat();
  for(const face of 'URFDLB'){
    assert.equal(stickers.filter(s=>s===face).length,9);
    assert.equal(scrambled[face][4],face);
  }
  assert.throws(()=>cubeFaces('<script>'));
});
test('SVG shows exactly the three requested faces and tracks the scramble',()=>{
  const svg=cubeSVG('R U');
  assert.equal((svg.match(/<polygon /g)||[]).length,27);
  assert.deepEqual([...svg.matchAll(/data-face="([A-Z])"/g)].map(m=>m[1]),['U','F','R']);
  assert.notEqual(svg,cubeSVG('R U2'));
  assert.match(svg,/white on top and green in front/);
});
test('phone scramble lines stay balanced and preserve whole moves',()=>{
  for(const alg of ["R2 U' R2 B R' F' R D' R2 L2 U' B2 L2 U2 B2 U B2 D B2 R U2",Array(25).fill("R'").join(' ')]){
    const lines=scrambleLines(alg);
    assert.equal(lines.length,2);
    assert.equal(lines.join(' '),alg);
    assert.ok(Math.abs(lines[0].length-lines[1].length)<=3);
  }
  assert.deepEqual(scrambleLines('R'),['R']);
});
test('narrow screens add balanced lines while keeping readable text and whole moves',()=>{
  const alg=Array(25).fill("R'").join(' ');
  for(const capacity of [10,16,24,32]){
    const lines=scrambleLines(alg,capacity);
    assert.equal(lines.join(' '),alg);
    assert.ok(lines.every(line=>line.length<=capacity));
    assert.ok(Math.max(...lines.map(l=>l.length))-Math.min(...lines.map(l=>l.length))<=3);
  }
});
