import {cubeStickers,cubeFrame} from './cube.js';

const faces={
  U:{normal:[0,1,0]},
  R:{normal:[1,0,0]},
  F:{normal:[0,0,1]},
  D:{normal:[0,-1,0]},
  L:{normal:[-1,0,0]},
  B:{normal:[0,0,-1]},
};
const dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const camera=[1,26/30,1];
const project=([x,y,z])=>[90+26*(x-z),92-30*y+13*(x+z)];
const point=v=>project(v).map(n=>n.toFixed(2)).join(',');
const add=(a,b)=>a.map((v,i)=>v+b[i]);
const scale=(v,s)=>v.map(n=>n*s);
function rotate(v,axis,angle){
  const a=[0,0,0];a[axis]=1;
  const cross=[a[1]*v[2]-a[2]*v[1],a[2]*v[0]-a[0]*v[2],a[0]*v[1]-a[1]*v[0]];
  return v.map((n,i)=>i===axis?n:n*Math.cos(angle)+cross[i]*Math.sin(angle));
}

export function lessonCubeSVG(alg='',{orientation='white-top',target=[],move='',progress=0}={}){
  const token=move&&/^([URFDLB])(2|')?$/.exec(move);
  if(move&&!token)throw Error('Unsupported cube move');
  progress=Math.max(0,Math.min(1,progress));
  if(progress===1&&move){alg=`${alg} ${move}`;move='';}
  const normal=move?faces[token[1]].normal:null;
  const axis=normal?.findIndex(n=>n!==0),sign=normal?.[axis];
  const angle=move?-sign*(token[2]==='2'?2:token[2]==="'"?-1:1)*Math.PI/2*progress:0;
  const transform=(v,moving)=>moving?rotate(v,axis,angle):v;
  const stickers=cubeStickers(alg),cubies=new Map();
  for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
    const position=[x,y,z],moving=!!move&&position[axis]===sign;
    cubies.set(position.join(','),{position,moving,stickers:[],depth:dot(transform(position,moving),camera)});
  }
  for(const sticker of stickers)cubies.get(sticker.position.join(',')).stickers.push(sticker);
  // The turning slab and the fixed slabs are separated by an axis plane.
  // Paint those slabs in camera order before ordering cubies within each slab.
  const ordered=[...cubies.values()].sort((a,b)=>move&&a.moving!==b.moving?(a.moving?sign:-sign):a.depth-b.depth);
  const {colors,label}=cubeFrame(orientation);
  let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 -12 204 212" role="img" aria-label="Cube: top, front and right. Start with ${label}.${target.length?' Dots mark the target corner and edge.':''}"><title>Cube · ${label}</title>`;
  for(const cubie of ordered){
    for(const [face,{normal}] of Object.entries(faces)){
      const facing=transform(normal,cubie.moving);
      if(dot(facing,camera)<=1e-8)continue;
      const axis=normal.findIndex(n=>n!==0),tangents=[0,1,2].filter(i=>i!==axis);
      const center=add(cubie.position,scale(normal,.5));
      const vertex=(u,v)=>{
        const p=[...center];p[tangents[0]]+=u;p[tangents[1]]+=v;
        return transform(p,cubie.moving);
      };
      const corners=size=>[[-size,-size],[size,-size],[size,size],[-size,size]].map(([u,v])=>point(vertex(u,v))).join(' ');
      svg+=`<g data-face="${face}"><polygon points="${corners(.5)}" fill="#10141c" stroke="#10141c" stroke-width="0.3"/>`;
      const sticker=cubie.stickers.find(s=>dot(s.normal,normal)===1);
      if(sticker){
        svg+=`<polygon data-cubie="${sticker.cubie}" data-sticker="${sticker.cubie}:${sticker.face}" points="${corners(.445)}" fill="${colors[sticker.face]}" stroke="#10141c" stroke-width="1" stroke-linejoin="round"/>`;
        if(target.includes(sticker.cubie)){
          const ring=Array.from({length:24},(_,i)=>point(vertex(.14*Math.cos(i*Math.PI/12),.14*Math.sin(i*Math.PI/12)))).join(' ');
          svg+=`<polygon data-target="${sticker.cubie}" points="${ring}" fill="#10141c" stroke="white" stroke-width="1.5"/>`;
        }
        if(sticker.cubie.split(',').filter(n=>n!=='0').length===1){
          const [x,y]=project(transform(center,cubie.moving));
          svg+=`<text x="${x.toFixed(2)}" y="${(y+3).toFixed(2)}" text-anchor="middle" style="fill:#10141c;font:700 9px system-ui">${sticker.face}</text>`;
        }
      }
      svg+='</g>';
    }
  }
  return svg+'</svg>';
}
