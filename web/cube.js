// Sticker coordinates use x = right, y = up, z = front.
const FACES = {
  U: {normal:[0,1,0],right:[1,0,0],down:[0,0,1],color:'#f4f4ef'},
  R: {normal:[1,0,0],right:[0,0,-1],down:[0,-1,0],color:'#e9474f'},
  F: {normal:[0,0,1],right:[1,0,0],down:[0,-1,0],color:'#29b875'},
  D: {normal:[0,-1,0],right:[1,0,0],down:[0,0,-1],color:'#f5d447'},
  L: {normal:[-1,0,0],right:[0,0,1],down:[0,-1,0],color:'#ff942f'},
  B: {normal:[0,0,-1],right:[-1,0,0],down:[0,-1,0],color:'#4285ec'},
};
const colors=Object.fromEntries(Object.entries(FACES).map(([face,{color}])=>[face,color]));
const frames={
  'white-top':{colors,label:'white on top and green in front'},
  'white-bottom':{
    colors:{U:colors.D,D:colors.U,F:colors.F,B:colors.B,R:colors.L,L:colors.R},
    label:'yellow on top, white on bottom, green in front and orange on the right',
  },
};
export function cubeFrame(orientation='white-top'){return frames[orientation]??frames['white-top'];}
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
function rotate(v,axis,direction){
  const a=[0,0,0];a[axis]=1;
  const cross=[a[1]*v[2]-a[2]*v[1],a[2]*v[0]-a[0]*v[2],a[0]*v[1]-a[1]*v[0]];
  return cross.map((n,i)=>i===axis?v[i]:n*direction);
}
export function cubeStickers(alg=''){
  const stickers=Object.entries(FACES).flatMap(([face,{normal,right,down}])=>Array.from({length:9},(_,i)=>({
    face,normal:[...normal],position:normal.map((v,a)=>v+(i%3-1)*right[a]+(Math.floor(i/3)-1)*down[a]),
  })));
  for(const sticker of stickers)sticker.cubie=sticker.position.join(',');
  for(const token of alg.trim().split(/\s+/).filter(Boolean)){
    const move=/^([URFDLB])(2|')?$/.exec(token);
    if(!move)throw Error('Unsupported cube move');
    const normal=FACES[move[1]].normal,axis=normal.findIndex(v=>v!==0),sign=normal[axis];
    const turns=move[2]==='2'?2:move[2]==="'"?3:1;
    for(let turn=0;turn<turns;turn++)for(const sticker of stickers){
      if(sticker.position[axis]!==sign)continue;
      sticker.position=rotate(sticker.position,axis,-sign);
      sticker.normal=rotate(sticker.normal,axis,-sign);
    }
  }
  return stickers;
}
function stickerFaces(stickers){
  return Object.fromEntries(Object.entries(FACES).map(([face,{normal,right,down}])=>{
    const cells=Array(9);
    for(const s of stickers)if(dot(s.normal,normal)===1)cells[(dot(s.position,down)+1)*3+dot(s.position,right)+1]=s;
    return [face,cells];
  }));
}
export function cubeFaces(alg){
  return Object.fromEntries(Object.entries(stickerFaces(cubeStickers(alg))).map(([face,cells])=>[face,cells.map(s=>s.face)]));
}
export function cubeSVG(alg,{orientation='white-top',target=[]}={}){
  const faces=stickerFaces(cubeStickers(alg)),{colors,label}=cubeFrame(orientation);
  // Each face is a subdivided parallelogram in the same isometric projection.
  const planes={U:[[90,8],[78,39],[-78,39]],F:[[12,47],[78,39],[0,90]],R:[[90,86],[78,-39],[0,90]]};
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 188" role="img" aria-label="Cube: top, front and right. Start with ${label}.${target.length?' Dots mark the target corner and edge.':''}"><title>Cube · ${label}</title>`;
  for(const [face,[origin,right,down]] of Object.entries(planes)){
    const point=(x,y)=>origin.map((v,i)=>(v+right[i]*x/3+down[i]*y/3).toFixed(2)).join(',');
    svg+=`<g data-face="${face}">`;
    faces[face].forEach((sticker,i)=>{
      const x=i%3,y=Math.floor(i/3),gap=.055;
      svg+=`<polygon data-cubie="${sticker.cubie}" points="${point(x+gap,y+gap)} ${point(x+1-gap,y+gap)} ${point(x+1-gap,y+1-gap)} ${point(x+gap,y+1-gap)}" fill="${colors[sticker.face]}" stroke="#10141c" stroke-width="1" stroke-linejoin="round"/>`;
      if(target.includes(sticker.cubie)){
        const center=point(x+.5,y+.5).split(',');
        svg+=`<circle data-target="${sticker.cubie}" cx="${center[0]}" cy="${center[1]}" r="4" fill="#10141c" stroke="white" stroke-width="1.5"/>`;
      }
    });
    const center=point(1.5,1.5).split(',');
    svg+=`<text x="${center[0]}" y="${Number(center[1])+3}" text-anchor="middle" style="fill:#10141c;font:700 9px system-ui">${face}</text></g>`;
  }
  return svg+'</svg>';
}
export function scrambleLines(alg,maxChars=Infinity){
  const moves=alg.trim().split(/\s+/).filter(Boolean);
  if(moves.length<2)return [moves.join(' ')];
  maxChars=Math.max(maxChars,...moves.map(m=>m.length));
  // Find the fewest fitting lines, then balance them without splitting a move.
  for(let count=2;count<=moves.length;count++){
    const dp=Array.from({length:count+1},()=>Array(moves.length+1));
    dp[0][0]={cost:0,lines:[]};
    for(let k=1;k<=count;k++)for(let end=k;end<=moves.length;end++){
      for(let start=k-1;start<end;start++){
        const previous=dp[k-1][start],line=moves.slice(start,end).join(' ');
        if(!previous||line.length>maxChars)continue;
        const cost=previous.cost+line.length**2;
        if(!dp[k][end]||cost<dp[k][end].cost)dp[k][end]={cost,lines:[...previous.lines,line]};
      }
    }
    if(dp[count][moves.length])return dp[count][moves.length].lines;
  }
  return moves;
}
