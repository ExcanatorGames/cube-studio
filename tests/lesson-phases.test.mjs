import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lessonPhases,lessonFocus} from '../web/lesson-phases.js';
import {getLesson,caseLabel,orientLessonCase} from '../web/lessons.js';
import {createExercise} from '../web/lesson-scrambler.js';
import {lessonCubeSVG} from '../web/lesson-cube.js';
import {cubeStickers} from '../web/cube.js';

const cases=getLesson('f2l').cases;
const byId=id=>cases.find(item=>item.id===id);
const moves=item=>item.solution.split(' ');
const inverse=algorithm=>algorithm.split(' ').reverse().map(move=>move.endsWith('2')?move:move.endsWith("'")?move.slice(0,-1):move+"'").join(' ');
const outline=item=>lessonPhases(item).map(phase=>
  `${phase.label} [${moves(item).slice(phase.start,phase.end).join(' ')}]${phase.after?' > '+caseLabel(byId(phase.after)):''}`).join(' | ');
function seeded(seed=1){return ()=>(seed=seed*16807%2147483647)/2147483647;}

test('every F2L solution splits into steps that cover all its moves and end with the pair solved',()=>{
  for(const item of cases){
    const variants=[item.solution,...Object.values(item.alignmentSolutions)];
    for(const solution of variants){
      const phases=lessonPhases({...item,solution,setup:inverse(solution)});
      assert.ok(phases?.length,`${item.id}: ${solution}`);
      assert.equal(phases[0].start,0);
      assert.equal(phases.at(-1).end,solution.split(' ').length);
      phases.forEach((phase,i)=>{
        if(i)assert.equal(phase.start,phases[i-1].end,'steps follow each other');
        assert.ok(phase.end-phase.start-phase.align>=3,'every step contains a slot trigger');
        assert.ok(phase.label&&/^[A-Z].*\.$/.test(phase.detail));
      });
      assert.equal(phases.at(-1).after,null,'the last step solves the pair');
      assert.ok(['insert','pair-insert'].includes(phases.at(-1).kind));
    }
  }
});

test('the case a step leaves is the catalog case its remaining moves solve',()=>{
  for(const item of cases){
    const phases=lessonPhases(item);
    for(const phase of phases.slice(0,-1)){
      const left=byId(phase.after);
      assert.ok(left,`${item.id} leaves a known case`);
      assert.notEqual(left.id,item.id);
      // Reaching the named case from solved and then playing the remaining
      // moves solves the pair, whatever turn of the top layer separates them.
      const rest=moves(item).slice(phase.end).join(' ');
      const solves=['','U','U2',"U'"].some(turn=>{
        const pair=cubeStickers([left.setup,turn,rest].filter(Boolean).join(' ')).filter(sticker=>item.target.includes(sticker.cubie));
        const solved=cubeStickers().filter(sticker=>item.target.includes(sticker.cubie));
        return JSON.stringify(pair)===JSON.stringify(solved);
      });
      assert.ok(solves,`${item.id}: ${rest} solves ${left.id}`);
    }
  }
});

test('every case reduces to an easy insert, and the easy inserts are a single step',()=>{
  const easy=cases.filter(item=>item.group==='Easy Inserts');
  for(const item of easy)assert.equal(lessonPhases(item).length,1,item.id);
  for(const item of cases.filter(item=>item.group!=='Easy Inserts')){
    const phases=lessonPhases(item);
    assert.ok(phases.length>=2&&phases.length<=3,item.id);
    assert.ok(easy.some(other=>other.id===phases.at(-2).after),`${item.id} ends on an easy insert`);
  }
});

test('steps are named by what they do to the pair',()=>{
  assert.equal(outline(byId('ready-right')),"Insert [U R U' R']");
  assert.equal(outline(byId('pair-1-3-0')),"Pair & insert [R U R']");
  assert.equal(outline(byId('pair-2-3-0')),"Pair up [U' R U R'] > Easy 1 | Insert [U2 R U' R']");
  assert.equal(outline(byId('pair-0-2-0')),"Turn corner [R U' R'] > Easy 3 | Pair & insert [U2 R U R']");
  assert.equal(outline(byId('pair-2-1-0')),"Split [F' U F] > Easy 3 | Pair & insert [U2 R U R']");
  assert.equal(outline(byId('slot-4-1-0-0')),"Take out & pair [F' U2 F] > Easy 1 | Insert [R U2 R']");
  assert.equal(outline(byId('slot-4-2-0-0')),"Take out [R U R'] > Easy 3 | Pair & insert [U' R U R']");
  assert.equal(outline(byId('pair-0-1-0')),"Park [R U R'] > Corner 3 | Take out [F' U F] > Easy 3 | Pair & insert [R U R']");
  assert.equal(outline(byId('slot-4-1-8-1')),"Take out [F' U F] > Disc. 7 | Turn corner [R U' R'] > Easy 3 | Pair & insert [U2 R U R']");
  const [first,last]=lessonPhases(byId('pair-2-3-0'));
  assert.deepEqual([first.kind,first.align,first.detail],['pair',1,'Line up, then join the corner and edge in the top layer.']);
  assert.deepEqual([last.kind,last.align,last.detail],['insert',1,'Line up, then put the joined pair into its slot.']);
  assert.equal(lessonPhases(byId('pair-1-3-0'))[0].detail,'Join the corner and edge on the way into the slot.');
  assert.equal(lessonPhases(byId('pair-0-1-0'))[0].detail,'Put the corner into the slot for now.');
  assert.equal(lessonPhases(byId('slot-4-1-8-1'))[0].detail,'Take both pieces out of the slot.');
});

test('steps follow the displayed solution in every slot, alignment and cross position',()=>{
  const random=seeded(7);
  for(let i=0;i<cases.length*4;i++){
    const item=cases[i%cases.length];
    const exercise={...item,...createExercise('f2l',{random,caseIds:[item.id]})};
    const expected=lessonPhases({...item,solution:item.alignmentSolutions[exercise.auf]||item.solution,
      setup:inverse(item.alignmentSolutions[exercise.auf]||item.solution)});
    for(const orientation of ['white-bottom','white-top']){
      const view=orientLessonCase(exercise,orientation),phases=lessonPhases(view);
      assert.ok(phases,`${item.id} ${exercise.slot} ${orientation}`);
      assert.equal(phases.at(-1).end,view.solution.split(' ').length);
      assert.equal(phases.at(-1).after,null);
      // An alignment without its own solution adds or merges a leading top
      // turn; the triggers, and so the cases they leave, stay the same.
      assert.deepEqual(phases.map(phase=>phase.after),expected.map(phase=>phase.after));
      assert.deepEqual(phases.map(phase=>phase.kind),expected.map(phase=>phase.kind));
      assert.match(phases.map(phase=>phase.detail).join(' '),orientation==='white-top'?/^(?!.*top layer)/:/^(?!.*bottom layer)/);
    }
  }
});

test('algorithms that are not a pair solved with slot triggers have no steps',()=>{
  for(const item of getLesson('ll').cases)assert.equal(lessonPhases(item),null,item.id);
  const pair=byId('pair-2-3-0');
  assert.equal(lessonPhases({...pair,solution:"U' R U R'"}),null,'the pair must end solved');
  assert.equal(lessonPhases({...pair,solution:"R2 U R2",setup:"R2 U' R2"}),null);
  assert.equal(lessonPhases({...pair,target:[]}),null);
  assert.equal(lessonPhases(),null);
});

test('focus keeps the pair, the cross and the centers, and dims every other piece',()=>{
  const item=byId('pair-2-3-0');
  for(const orientation of ['white-bottom','white-top']){
    const view=orientLessonCase(item,orientation),focus=lessonFocus(view.target);
    assert.equal(new Set(focus).size,12);
    const cross=orientation==='white-bottom'?-1:1;
    for(const cubie of [...view.target,'0,1,0','1,0,0','0,0,1',`1,${cross},0`,`0,${cross},1`,`-1,${cross},0`,`0,${cross},-1`])
      assert.ok(focus.includes(cubie),cubie);
    const svg=lessonCubeSVG(view.setup,{...view,focus});
    const stickers=[...svg.matchAll(/data-cubie="([^"]+)" data-sticker="[^"]+"( data-dim)? points="[^"]+" fill="(#[0-9a-f]{6})"/g)];
    assert.equal(stickers.length,27);
    const plain=lessonCubeSVG(view.setup,view);
    for(const [,cubie,dim,fill] of stickers){
      assert.equal(!!dim,!focus.includes(cubie),cubie);
      assert.equal(plain.includes(`fill="${fill}"`),!dim,'dimmed stickers use a muted color');
    }
    assert.ok(stickers.some(([,,dim])=>dim)&&stickers.some(([,,dim])=>!dim));
    assert.equal(lessonCubeSVG(view.setup,{...view,focus:null}),plain);
  }
  assert.equal(lessonFocus([]),null);
});
