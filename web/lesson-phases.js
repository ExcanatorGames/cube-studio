import {cubeStickers} from './cube.js';
import {getLesson} from './lessons.js';

// Splits an F2L solution into the steps a solver thinks in, and names what
// each step does to the pair. Everything is read from the cube state, so it
// follows the displayed solution in any slot, alignment and cross position.

const inverse=move=>move.endsWith('2')?move:move.endsWith("'")?move.slice(0,-1):move+"'";
const HOME=Object.fromEntries(cubeStickers().map(sticker=>[sticker.face,sticker.normal]));
const same=(a,b)=>a.every((value,i)=>value===b[i]);
const turn=([x,y,z])=>[z,y,-x||0];
const SLOT=[[1,-1,1],[1,0,1]];

/** Maps the displayed cube onto the teaching position: cross on the bottom
 * and the pair's slot at the front right. Null unless `target` is a pair. */
function teachingFrame(target){
  if(target?.length!==2)return null;
  const [corner,edge]=target.map(cubie=>cubie.split(',').map(Number));
  const crossOnTop=corner[1]===1;
  for(let turns=0;turns<4;turns++){
    const map=vector=>{
      let [x,y,z]=vector;
      // Turning the cube over about the front/back axis, as lessons do.
      if(crossOnTop)[x,y]=[-x||0,-y||0];
      let mapped=[x,y,z];
      for(let i=0;i<turns;i++)mapped=turn(mapped);
      return mapped;
    };
    if(same(map(corner),SLOT[0])&&same(map(edge),SLOT[1]))return {map,crossOnTop};
  }
  return null;
}

/** Where the pair is, in the teaching position. The key is the same for
 * every turn of the free layer, so it names one of the 41 cases. */
function pairState(stickers,target,map=vector=>vector){
  let pieces=stickers.filter(sticker=>target.includes(sticker.cubie)).map(sticker=>({
    piece:target.indexOf(sticker.cubie),home:map(HOME[sticker.face]),
    position:map(sticker.position),normal:map(sticker.normal),
  }));
  const place=piece=>{
    const {position}=pieces.find(item=>item.piece===piece);
    return same(position,SLOT[piece])?'slot':position[1]===1?'top':null;
  };
  const corner=place(0),edge=place(1);
  if(!corner||!edge)return null;
  const solved=pieces.every(item=>same(item.home,item.normal)&&same(item.position,SLOT[item.piece]));
  const [cornerAt,edgeAt]=[0,1].map(piece=>pieces.find(item=>item.piece===piece).position);
  const adjacent=cornerAt.reduce((sum,value,i)=>sum+Math.abs(value-edgeAt[i]),0)===1;
  // A joined pair moves as one block: both edge colors sit beside the same
  // colors of the corner.
  const joined=adjacent&&pieces.filter(item=>item.piece===1).every(sticker=>
    same(sticker.normal,pieces.find(item=>item.piece===0&&same(item.home,sticker.home)).normal));
  let key='';
  for(let i=0;i<4;i++){
    const signature=pieces.map(item=>[item.piece,item.home,item.position,item.normal].join(':')).sort().join('|');
    if(!key||signature<key)key=signature;
    pieces=pieces.map(item=>item.position[1]===1?{...item,position:turn(item.position),normal:turn(item.normal)}:item);
  }
  // White is the cross color: a corner showing it on the free layer has to
  // be turned before it can pair.
  const whiteUp=pieces.some(item=>item.piece===0&&same(item.home,[0,-1,0])&&same(item.normal,[0,1,0]));
  return {corner,edge,solved,joined,adjacent,whiteUp,key};
}

let catalog;
function caseAt(state){
  catalog||=new Map(getLesson('f2l').cases.map(item=>[pairState(cubeStickers(item.setup),item.target).key,item.id]));
  return catalog.get(state.key)||null;
}

// One step is an optional turn of the free layer to line up, then a slot
// trigger: a side turn, free-layer turns and the side turn undone.
function split(moves,free){
  const steps=[];
  let i=0;
  while(i<moves.length){
    const start=i;
    while(i<moves.length&&moves[i][0]===free)i++;
    const align=i-start;
    if(i<moves.length){
      const open=moves[i];
      let close=i+1;
      while(close<moves.length&&moves[close][0]===free)close++;
      if(open.endsWith('2')||close===i+1||moves[close]!==inverse(open))return null;
      i=close+1;
    }
    steps.push({start,end:i,align,trigger:i-start>align});
  }
  return steps;
}

const PIECES=['corner','edge'];
function describe(before,after,trigger){
  if(!trigger)return {kind:'align',label:'Line up',action:'turn the free layer'};
  const inSlot=state=>PIECES.filter(piece=>state[piece]==='slot');
  const was=inSlot(before),now=inSlot(after);
  if(after.solved)return before.joined
    ?{kind:'insert',label:'Insert',action:'put the joined pair into its slot'}
    :{kind:'pair-insert',label:'Pair & insert',action:'join the corner and edge on the way into the slot'};
  const out=was.filter(piece=>!now.includes(piece)),into=now.filter(piece=>!was.includes(piece));
  const name=pieces=>pieces.length===2?'both pieces':'the '+pieces[0];
  if(out.length&&into.length)return {kind:'swap',label:'Swap',action:`put ${name(into)} into the slot as ${name(out)} comes out`};
  if(into.length)return {kind:'park',label:'Park',action:`put ${name(into)} into the slot for now`};
  if(out.length){
    if(before.joined)return {kind:'extract',label:'Take out',action:`take ${name(out)} out of the slot, still joined`};
    return after.joined
      ?{kind:'extract-pair',label:'Take out & pair',action:`take ${name(out)} out of the slot, joining the pair`}
      :{kind:'extract',label:'Take out',action:`take ${name(out)} out of the slot`};
  }
  if(after.joined&&!before.joined)return {kind:'pair',label:'Pair up',action:'join the corner and edge in the free layer'};
  if(before.adjacent&&!after.adjacent)return {kind:'split',label:'Split',action:'separate the corner and edge'};
  if(before.whiteUp&&!after.whiteUp)return {kind:'turn',label:'Turn corner',action:'turn the corner so white faces the side'};
  return {kind:'setup',label:'Set up',action:'move the pieces to an easier case'};
}

/** The steps of an F2L solution, or null when it is not a pair solved with
 * slot triggers (last-layer algorithms, for example).
 * Each step: `start`/`end` move indexes, `align` (leading line-up turns),
 * `kind`, `label`, `detail`, and `after`: the case the cube shows once the
 * step is done, or null when the pair is solved. */
export function lessonPhases({setup='',solution='',target=[]}={}){
  const frame=teachingFrame(target);
  if(!frame)return null;
  const moves=solution.trim().split(/\s+/).filter(Boolean);
  const steps=split(moves,frame.crossOnTop?'D':'U');
  if(!steps?.length)return null;
  const state=count=>pairState(cubeStickers([setup,...moves.slice(0,count)].join(' ')),target,frame.map);
  const layer=frame.crossOnTop?'bottom layer':'top layer';
  let before=state(0);
  if(!before)return null;
  const phases=[];
  for(const step of steps){
    const after=state(step.end);
    if(!after)return null;
    const {kind,label,action}=describe(before,after,step.trigger);
    const text=(step.align&&step.trigger?'line up, then '+action:action).replace('free layer',layer);
    phases.push(Object.freeze({start:step.start,end:step.end,align:step.align,kind,label,
      detail:text[0].toUpperCase()+text.slice(1)+'.',after:after.solved?null:caseAt(after)}));
    before=after;
  }
  return before.solved?Object.freeze(phases):null;
}

/** Cubies to keep in full color while a pair is taught: the pair, the cross
 * it must preserve and the centers that name each side. */
export function lessonFocus(target){
  if(target?.length!==2)return null;
  const cross=Number(target[0].split(',')[1]);
  return [...target,'0,1,0','0,-1,0','1,0,0','-1,0,0','0,0,1','0,0,-1',
    `1,${cross},0`,`-1,${cross},0`,`0,${cross},1`,`0,${cross},-1`];
}
