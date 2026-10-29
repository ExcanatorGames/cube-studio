import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CUBE_COLORS, cubeFrame, cubeStickers, cubeOrientationId, validOrientation, orientAlgorithm, orientTargets, flipOrientation, getScrambleOrientation} from '../web/cube.js';
import {validateSnapshot} from '../web/device-storage.js';
import {splitMethods, selectedSplitSteps} from '../web/split-methods.js';

test('all 24 top/front frames preserve the physical scramble and turn directions', () => {
  const vectors = {R:[1,0,0],L:[-1,0,0],U:[0,1,0],D:[0,-1,0],F:[0,0,1],B:[0,0,-1]};
  const algorithm = "R U2 F' D L2 B' U R' F2";
  const key = sticker => `${sticker.face}:${sticker.position.join(',')}:${sticker.normal.join(',')}`;
  const expected = cubeStickers(algorithm).map(key).sort();
  let count = 0;
  for (const top of Object.keys(CUBE_COLORS)) for (const front of Object.keys(CUBE_COLORS)) {
    if (!validOrientation(top, front)) continue;
    count++;
    const orientation = cubeOrientationId(top, front), frame = cubeFrame(orientation);
    assert.equal(frame.faces.U, CUBE_COLORS[top]);
    assert.equal(frame.faces.F, CUBE_COLORS[front]);
    const basis = ['R','U','F'].map(face => vectors[frame.faces[face]]);
    const transform = v => v.map((_, i) => v.reduce((sum, n, axis) => sum + n * basis[axis][i], 0)).map(n => n || 0);
    const displayed = orientAlgorithm(algorithm, 'white-top', orientation);
    const actual = cubeStickers(displayed).map(s => key({face:frame.faces[s.face], position:transform(s.position), normal:transform(s.normal)})).sort();
    assert.deepEqual(actual, expected, orientation);
    assert.equal(orientAlgorithm(displayed, orientation, 'white-top'), algorithm);
    const target=['1,-1,1','1,0,1'];
    assert.deepEqual(orientTargets(orientTargets(target,'white-bottom',orientation),orientation,'white-bottom'),target);
    assert.equal(flipOrientation(flipOrientation(orientation)), orientation);
  }
  assert.equal(count, 24);
  assert.deepEqual(orientTargets(['1,-1,1','1,0,1'],'white-bottom','white-top'),['-1,1,1','-1,0,1']);
});

test('legacy custom splits migrate without loss and new preferences survive validation', () => {
  const {snapshot, issues} = validateSnapshot({settings:{preset:'custom',custom:['Plan','Finish'],orientation:'blue-red',crossPosition:'top',lessonOrientation:'white-top',solveColors:'neutral'}});
  assert.deepEqual(issues, []);
  assert.deepEqual(selectedSplitSteps(snapshot.settings), ['Plan','Finish']);
  const methods = splitMethods(snapshot.settings);
  assert.ok(methods.some(method => method.id === 'roux'));
  const settings = {...snapshot.settings, splitMethods:[...methods,{id:'my-list',name:'My list',steps:['One']}],preset:'my-list'};
  const reloaded = validateSnapshot({settings});
  assert.deepEqual(reloaded.issues, []);
  assert.deepEqual(selectedSplitSteps(reloaded.snapshot.settings), ['One']);
  assert.equal(reloaded.snapshot.settings.orientation, 'blue-red');
  assert.equal(reloaded.snapshot.settings.solveColors, 'neutral');
});

test('scramble orientation follows the default position unless explicitly chosen and recovers invalid preferences', () => {
  const settings = validateSnapshot({settings:{orientation:'blue-red'}}).snapshot.settings;
  assert.equal(settings.scrambleOrientation, 'default');
  assert.equal(getScrambleOrientation(settings), 'blue-red');
  assert.equal(getScrambleOrientation({...settings,orientation:'white-top'}), 'white-top');
  const saved = validateSnapshot({settings:{...settings,scrambleOrientation:'white-bottom'}});
  assert.deepEqual(saved.issues, []);
  assert.equal(getScrambleOrientation(saved.snapshot.settings), 'white-bottom');
  const recovered = validateSnapshot({settings:{...settings,scrambleOrientation:'white-yellow'}});
  assert.ok(recovered.issues.includes('settings.scrambleOrientation'));
  assert.equal(getScrambleOrientation(recovered.snapshot.settings), 'blue-red');
});

test('damaged split lists and impossible cube frames recover while valid lists survive', () => {
  for (const color of ['constructor','__proto__','unknown',null]) assert.equal(validOrientation(color, 'green'), false);
  const good = {id:'good',name:'Good',steps:['Start','Finish']};
  const {snapshot,issues} = validateSnapshot({settings:{orientation:'white-yellow',solveColors:'invalid',splitMethods:[good,{...good}, {id:'bad',name:'Bad',steps:[]}],preset:'bad'}});
  assert.deepEqual(snapshot.settings.splitMethods, [good]);
  assert.equal(snapshot.settings.preset, 'good');
  assert.equal(snapshot.settings.orientation, 'white-top');
  assert.equal(snapshot.settings.solveColors, 'white');
  assert.ok(issues.length >= 4);
  const empty = validateSnapshot({settings:{splitMethods:[],track:true}}).snapshot.settings;
  assert.equal(empty.track, false);
  assert.deepEqual(selectedSplitSteps(empty), []);
});
